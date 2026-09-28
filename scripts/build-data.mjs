// Builds the static JSON data feed for every resort.
// Run: FEED_DIR=feed node scripts/build-data.mjs   (Node 18+; used by .github/workflows/data.yml)
//
// To stay inside Open-Meteo's free limits with hundreds of resorts:
// - nearby resorts share one forecast / marine grid point (0.1°), fetched in batches;
// - 6-year climate normals are shared per 0.5° cell and only a few cells are
//   (re)built per run (NORMALS_BUDGET); others fall back to regional climate tables;
// - if a live pull fails, the last good pull (< 24 h old) is reused and flagged.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RESORTS, REGIONS, AIRPORTS } from "../js/resorts.js";
import { iso, addDays, doy, buildDay, normalsFromArchive, setLearnedSargassum } from "../js/model.js";
import { SEGMENTS } from "../js/sargassum/segments.js";
import { features, predict } from "../js/sargassum/features.js";
import * as api from "../js/api.js";

const root = new URL((process.env.FEED_DIR || "feed").replace(/\/?$/, "/"), new URL("../", import.meta.url));
const NORMALS_BUDGET = +(process.env.NORMALS_BUDGET ?? 3);
const NORMALS_PAUSE_MS = +(process.env.NORMALS_PAUSE_MS ?? 3000);
const NORMALS_MAX_AGE = 180 * 86400000;
const BATCH = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = new Date();
const TODAY = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
const f = (p) => new URL(p, root);
const readJSON = async (p) => { try { return JSON.parse(await readFile(f(p), "utf8")); } catch { return null; } };
const US_LIKE = new Set(["US", "PR", "VI"]);

// ---------- live pulls, de-duplicated and batched ----------
async function pullGroups(kind, pointOf, fetchMany) {
  const groups = new Map(); // key -> {pt, ids}
  for (const r of RESORTS) {
    const pt = api.cell(pointOf(r), 0.1), key = pt.join("_");
    if (!groups.has(key)) groups.set(key, { pt, ids: [] });
    groups.get(key).ids.push(r.id);
  }
  const keys = [...groups.keys()], out = new Map();
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    let res = null;
    try { res = await fetchMany(chunk.map((k) => groups.get(k).pt)); } catch (e) { console.warn(`${kind} batch ${i / BATCH}: ${e.message.slice(0, 120)}`); }
    for (const [j, k] of chunk.entries()) out.set(k, await lastGood(kind, k, res?.[j]));
    await sleep(1000);
  }
  const byResort = new Map();
  for (const [k, g] of groups) for (const id of g.ids) byResort.set(id, out.get(k));
  console.log(`${kind}: ${groups.size} grid points for ${RESORTS.length} resorts`);
  return byResort;
}

// Save each successful pull; on failure reuse the previous one if < 24 h old.
async function lastGood(kind, key, value) {
  const p = `last/${kind}/${key}.json`;
  if (value) {
    await writeFile(f(p), JSON.stringify({ fetched: new Date().toISOString(), v: value }));
    return value;
  }
  const j = await readJSON(p);
  if (j && Date.now() - Date.parse(j.fetched) < 86400000) return { ...j.v, stale: true, fetched: j.fetched };
  return null;
}

// ---------- climate normals per 0.5° cell ----------
async function loadNormals() {
  const cells = new Map();
  for (const r of RESORTS) {
    const key = api.cellKey([r.lat, r.lon], 0.5);
    if (!cells.has(key)) cells.set(key, r);
  }
  const have = new Map();
  for (const key of cells.keys()) have.set(key, await readJSON(`normals/${key}.json`));
  // Missing cells first, then the oldest.
  const todo = [...cells.keys()]
    .filter((k) => !have.get(k) || Date.now() - Date.parse(have.get(k).generated) > NORMALS_MAX_AGE)
    .sort((a, b) => (Date.parse(have.get(a)?.generated) || 0) - (Date.parse(have.get(b)?.generated) || 0))
    .slice(0, NORMALS_BUDGET);
  for (const key of todo) {
    const r = cells.get(key);
    try {
      const h = await api.history(r.lat, r.lon, api.marinePoint(r));
      const j = { generated: new Date().toISOString(), normals: normalsFromArchive(h.daily, h.marine) };
      await writeFile(f(`normals/${key}.json`), JSON.stringify(j));
      have.set(key, j);
      console.log(`normals ${key} built`);
    } catch (e) { console.warn(`normals ${key}: ${e.message.slice(0, 120)}`); }
    await sleep(NORMALS_PAUSE_MS);
  }
  const ready = [...have.values()].filter(Boolean).length;
  console.log(`normals: ${ready}/${cells.size} cells ready (${todo.length} attempted this run)`);
  return (r) => have.get(api.cellKey([r.lat, r.lon], 0.5))?.normals ?? null;
}

// ---------- NWS alerts (US, PR, USVI), shared per 0.1° cell ----------
async function loadAlerts() {
  const cache = new Map(), out = new Map();
  for (const r of RESORTS) {
    if (!US_LIKE.has(REGIONS[r.region].country)) continue;
    const key = api.cellKey([r.lat, r.lon], 0.1);
    if (!cache.has(key)) {
      cache.set(key, await api.nwsAlerts(r.lat, r.lon).catch(() => []));
      await sleep(150);
    }
    out.set(r.id, cache.get(key));
  }
  return out;
}

// ---------- output ----------
const FORECAST_DAYS = 16;
function compactOutlook(days) {
  const col = (fn) => days.map(fn);
  return {
    start: days[0]?.date,
    source: col((q) => q.source),
    score: col((q) => q.score.total),
    scoreParts: Object.fromEntries(Object.keys(days[0]?.score.parts ?? {}).map((k) => [k, col((q) => q.score.parts[k])])),
    sargassum: col((q) => q.sargassum.score),
    tmaxF: col((q) => q.weather.tmaxF ?? null), tminF: col((q) => q.weather.tminF ?? null),
    precipProb: col((q) => q.weather.precipProb ?? null), cloud: col((q) => q.weather.cloud ?? null), uv: col((q) => q.weather.uv ?? null),
    sstF: col((q) => q.ocean.sstF ?? null), waveFt: col((q) => q.ocean.waveFt ?? null),
    crowdResort: col((q) => q.crowds.resort.score), crowdAirport: col((q) => q.crowds.airport.score), crowdCity: col((q) => q.crowds.city.score),
    tropicalPct: col((q) => q.safety.tropical.pct),
    holidays: Object.fromEntries(days.filter((q) => q.holidays.length).map((q) => [q.date, q.holidays])),
  };
}
const slim = (q) => {
  const { cleanup, ...sarg } = q.sargassum;
  const { local, travelAdvisory, ...safe } = q.safety;
  return { ...q, sargassum: sarg, safety: safe };
};

for (const d of ["resorts", "normals", "last/forecast", "last/marine"]) await mkdir(f(d), { recursive: true });
const FC = await pullGroups("forecast", (r) => [r.lat, r.lon], api.forecastMany);
const MR = await pullGroups("marine", api.marinePoint, api.marineMany);
const normalsFor = await loadNormals();
const ALERTS = await loadAlerts();

// ---------- learned sargassum model (from the sargassum-data branch) ----------
const SARG_BASE = process.env.SARG_BASE || "https://raw.githubusercontent.com/alexchouck-hash/alexchouck-hash.github.io/sargassum-data/";
async function learnedSargassum() {
  const get = async (f) => { try { const r = await fetch(SARG_BASE + f); return r.ok ? await r.json() : null; } catch { return null; } };
  const [model, climatology, latest, skill] = await Promise.all(["model.json", "climatology.json", "latest.json", "skill.json"].map(get));
  if (!climatology?.segments) { console.log("sargassum: no trained climatology yet; using built-in seasonal model"); return null; }
  // Quality gate: only use what beats the simpler alternative on held-out years.
  const auc = (n) => skill?.results?.find((r) => r.name === n)?.auc ?? null;
  const [aModel, aClim, aLegacy] = [auc("model"), auc("climatology"), auc("legacy-seasonal")];
  if (aClim != null && aLegacy != null && aClim <= aLegacy) { console.log(`sargassum: learned climatology (AUC ${aClim}) not better than seasonal model (${aLegacy}); keeping seasonal model`); return null; }
  const useWeekAhead = aModel != null && aClim != null && aModel > aClim;
  if (!useWeekAhead) console.log(`sargassum: week-ahead model (AUC ${aModel}) not better than climatology (${aClim}); using climatology only`);
  const nextWeek = {};
  if (useWeekAhead && model?.weights && latest?.segments) {
    for (const seg of SEGMENTS) {
      const sat = latest.segments[seg.key]; if (!sat) continue;
      // Forecast drivers for the coming week: mean wind over days 0–6 and the current surface current.
      const rid = seg.resorts[0], F = FC.get(rid), M = MR.get(rid);
      const days = Object.values(F?.days || {}).slice(0, 7).filter((x) => x.windMph != null && x.windDir != null);
      if (!days.length) continue;
      let wu = 0, wv = 0;
      for (const x of days) { const r = ((x.windDir + 180) * Math.PI) / 180, ms = x.windMph * 0.447; wu += ms * Math.sin(r); wv += ms * Math.cos(r); }
      const c = M?.current, cr = c?.currentDir != null ? (c.currentDir * Math.PI) / 180 : null, cms = c?.currentKmh != null ? c.currentKmh / 3.6 : null;
      const drv = { windU: wu / days.length, windV: wv / days.length, curU: cr != null && cms != null ? cms * Math.sin(cr) : null, curV: cr != null && cms != null ? cms * Math.cos(cr) : null };
      const wk = Math.min(52, Math.floor((doy(TODAY) - 1) / 7));
      nextWeek[seg.key] = +predict(model, features(sat, drv, { facing: seg.facing, doy: doy(TODAY), clim: climatology.segments[seg.key]?.[wk] })).toFixed(3);
    }
  }
  const learned = { climatology, nextWeek, satelliteDate: latest?.date ?? null, trainedAt: model?.trainedAt ?? null,
    skill: skill?.results ? { testYears: skill.testYears, results: skill.results, nTest: skill.nTest } : null };
  console.log(`sargassum: learned climatology for ${Object.keys(climatology.segments).length} segments, week-ahead for ${Object.keys(nextWeek).length} (satellite ${latest?.date ?? "n/a"})`);
  return learned;
}
const LEARNED = await learnedSargassum();
setLearnedSargassum(LEARNED);
if (LEARNED) await writeFile(f("sargassum.json"), JSON.stringify({ generated: new Date().toISOString(), ...LEARNED }));

const index = [];
for (const r of RESORTS) {
  const F = FC.get(r.id), M = MR.get(r.id), nm = normalsFor(r), reg = REGIONS[r.region];
  const days = Array.from({ length: 366 }, (_, i) => {
    const d = addDays(TODAY, i), k = iso(d);
    return buildDay(r, d, TODAY, { fc: F?.days[k] || null, marine: M?.days[k] || null, nm: nm?.[doy(d)] || null });
  });
  const out = {
    meta: {
      generated: new Date().toISOString(), units: { temp: "F", wave: "ft", precip: "in", wind: "mph" },
      climateSource: nm ? "6-year ERA5 normals for this location" : "regional monthly climate table (location normals pending)",
      sources: ["Open-Meteo forecast/marine/ERA5 archive", "NOAA NWS alerts", "Sargassum & crowd models (see js/model.js)"],
    },
    resort: { ...r, regionName: reg.name, country: reg.country, airports: r.airports.map((a) => ({ code: a, name: AIRPORTS[a]?.[0] })) },
    cleanup: reg.cleanup, safety: reg.safety, tourism: reg.tourism,
    current: {
      weather: F?.current ?? null, marine: M?.current ?? null,
      staleSince: { weather: F?.stale ? F.fetched : null, marine: M?.stale ? M.fetched : null },
      alerts: ALERTS.get(r.id) ?? [],
    },
    days: days.slice(0, FORECAST_DAYS).map(slim),
    outlook: compactOutlook(days.slice(FORECAST_DAYS)),
  };
  await writeFile(f(`resorts/${r.id}.json`), JSON.stringify(out));
  const t = days[0], next = days.slice(0, FORECAST_DAYS);
  index.push({
    id: r.id, name: r.name, city: r.city, region: r.region, lat: r.lat, lon: r.lon,
    today: { score: t.score.total, sargassum: t.sargassum.label, sargassumScore: t.sargassum.score, tmaxF: t.weather.tmaxF ?? null, sstF: t.ocean.sstF ?? null, waveFt: t.ocean.waveFt ?? null, uv: t.weather.uv ?? null, crowd: t.crowds.resort.label },
    next16: Object.fromEntries([
      ["code", (q) => (q.source === "forecast" ? q.weather.code ?? null : null)],
      ["tmaxF", (q) => (q.source === "forecast" ? q.weather.tmaxF : null)], ["tminF", (q) => (q.source === "forecast" ? q.weather.tminF : null)],
      ["precipProb", (q) => (q.source === "forecast" ? q.weather.precipProb : null)], ["cloud", (q) => (q.source === "forecast" ? q.weather.cloud : null)],
      ["uv", (q) => (q.source === "forecast" ? q.weather.uv : null)], ["windDir", (q) => q.weather.windDir], ["windMph", (q) => q.weather.windMph],
      ["waveFt", (q) => (q.ocean.source === "forecast" ? q.ocean.waveFt : null)], ["periodS", (q) => q.ocean.periodS], ["sstF", (q) => (q.ocean.source === "forecast" ? q.ocean.sstF : null)],
      ["score", (q) => q.score.total],
    ].map(([k, fn]) => [k, next.map((q) => fn(q) ?? null)])),
    url: `resorts/${r.id}.json`,
  });
}
await writeFile(f("index.json"), JSON.stringify({ generated: new Date().toISOString(), start: iso(TODAY), count: index.length, resorts: index }));
console.log(`wrote ${index.length} resorts`);
