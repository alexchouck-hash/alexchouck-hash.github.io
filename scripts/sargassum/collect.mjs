// Collects sargassum satellite history and drivers for every coastal segment.
//
//   node scripts/sargassum/collect.mjs smoke      # verify endpoints, no writes (CI)
//   node scripts/sargassum/collect.mjs discover   # write dataset metadata
//   node scripts/sargassum/collect.mjs backfill   # satellite history, resumable, budgeted
//   node scripts/sargassum/collect.mjs drivers    # wind + current history, resumable
//   node scripts/sargassum/collect.mjs latest     # newest 7-day composite for all segments
//
// Output (SARG_DIR, default "sarg"): meta.json, progress.json, sat/<seg>.csv,
// drivers/<seg>.csv, latest.json. Published on the sargassum-data branch.

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SEGMENTS } from "../../js/sargassum/segments.js";
import { SAT_COLS } from "../../js/sargassum/features.js";
import { DATASETS, describe, boxQuery, summarize, fetchText } from "./erddap.mjs";

const DIR = (process.env.SARG_DIR || "sarg").replace(/\/?$/, "/");
const BUDGET = +(process.env.SARG_BUDGET ?? 60);
const START_YEAR = +(process.env.SARG_START_YEAR ?? 2016);
const PAUSE = +(process.env.SARG_PAUSE_MS ?? 1500); // politeness delay between requests
const sleep = (ms) => new Promise((r) => setTimeout(r, (ms * PAUSE) / 1500));
const readJSON = async (p, dflt) => { try { return JSON.parse(await readFile(DIR + p, "utf8")); } catch { return dflt; } };
const writeJSON = (p, v) => writeFile(DIR + p, JSON.stringify(v));
const iso = (d) => d.toISOString().slice(0, 10);

// One CSV column pair (p90, valid fraction) per ring × sector (see features.js).
const satRow = ({ date, rings }) => [date, ...rings.flatMap((sectors) => sectors.flatMap((c) => [c.p90 == null ? "" : +c.p90.toPrecision(4), c.total ? +(c.n / c.total).toFixed(2) : ""]))].join(",");

async function meta7() {
  const m = await readJSON("meta.json", null);
  if (m?.d7?.dataVar) return m.d7;
  const d7 = await describe(DATASETS.d7);
  await writeJSON("meta.json", { d7, updated: new Date().toISOString() });
  return d7;
}
function timeStride(meta) {
  const t = meta.axes.find((a) => /^time/i.test(a.name));
  const stepDays = Math.abs(t.spacing) / 86400 || 1;
  return { stride: Math.max(1, Math.round(7 / stepDays)), stepDays, first: new Date(t.range[0] * 1000), last: new Date(t.range[1] * 1000) };
}

async function smoke() {
  const m = await describe(DATASETS.d7);
  console.log(JSON.stringify({ id: m.id, dataVar: m.dataVar, units: m.units, axes: m.axes.map(({ name, n, spacing, range }) => ({ name, n, spacing, range })) }, null, 1));
  const { last, stride } = timeStride(m);
  const seg = SEGMENTS.find((s) => s.key.startsWith("21_-87")) ?? SEGMENTS[0];
  const t1 = iso(last), t0 = iso(new Date(last - 14 * 864e5));
  const url = boxQuery(m, { lat: seg.lat, lon: seg.lon, t0, t1, timeStride: stride, pixelKm: 8 });
  console.log("query:", url);
  const rows = summarize(await fetchText(url), m, seg);
  console.log(`segment ${seg.key}: ${rows.length} time steps; ring0 valid sectors ${rows[0]?.rings[0].filter((c) => c.n).length}/8; sample`, JSON.stringify(rows[0]?.rings[1].map((c) => c.p90)));
  for (const [name, u] of [
    ["open-meteo archive", `https://archive-api.open-meteo.com/v1/archive?latitude=${seg.lat}&longitude=${seg.lon}&start_date=2024-01-01&end_date=2024-01-03&daily=wind_speed_10m_mean,wind_direction_10m_dominant`],
    ["open-meteo marine currents", `https://marine-api.open-meteo.com/v1/marine?latitude=${seg.lat}&longitude=${seg.lon}&start_date=2024-01-01&end_date=2024-01-02&hourly=ocean_current_velocity,ocean_current_direction`],
  ]) {
    try { const t = await fetchText(u); console.log(`${name}: ok (${t.length} bytes)`); } catch (e) { console.log(`${name}: FAILED ${e.message.slice(0, 160)}`); }
  }
}

async function backfill() {
  const m = await meta7();
  const { stride, first, last } = timeStride(m);
  const progress = await readJSON("progress.json", { sat: {}, drivers: {} });
  await mkdir(DIR + "sat", { recursive: true });
  const y0 = Math.max(START_YEAR, first.getUTCFullYear()), y1 = last.getUTCFullYear();
  let used = 0, done = 0, total = 0;
  for (const seg of SEGMENTS) {
    const f = `sat/${seg.key}.csv`;
    if (!existsSync(DIR + f)) await writeFile(DIR + f, ["date", ...SAT_COLS].join(",") + "\n");
    for (let y = y0; y <= y1; y++) {
      total++;
      const k = `${seg.key}:${y}`;
      // The current year is re-fetched each run until it is complete.
      if (progress.sat[k] === "done") { done++; continue; }
      if (used >= BUDGET) continue;
      const t0 = progress.sat[k] || iso(new Date(Date.UTC(y, 0, 1) > first ? Date.UTC(y, 0, 1) : first));
      const t1 = iso(new Date(Math.min(Date.UTC(y, 11, 31), last)));
      if (t0 > t1) { progress.sat[k] = y < y1 ? "done" : t0; continue; }
      used++;
      try {
        const rows = summarize(await fetchText(boxQuery(m, { lat: seg.lat, lon: seg.lon, t0, t1, timeStride: stride })), m, seg);
        if (rows.length) await appendFile(DIR + f, rows.map(satRow).join("\n") + "\n");
        const lastRow = rows.at(-1)?.date;
        progress.sat[k] = y < y1 ? "done" : lastRow ? iso(new Date(Date.parse(lastRow) + 7 * 864e5)) : t0;
        if (progress.sat[k] === "done") done++;
      } catch (e) {
        console.warn(`sat ${k}: ${e.message.slice(0, 200)}`);
        // No data for that year at all (e.g. before the dataset starts): skip it.
        if (/no data|outside|out of range|start > stop/i.test(e.message) && y < y1) progress.sat[k] = "done";
      }
      await writeJSON("progress.json", progress);
      await sleep(1500);
    }
  }
  console.log(`satellite backfill: ${done}/${total} segment-years complete, ${used} requests this run`);
}

async function drivers() {
  const progress = await readJSON("progress.json", { sat: {}, drivers: {} });
  await mkdir(DIR + "drivers", { recursive: true });
  const end = iso(new Date(Date.now() - 6 * 864e5));
  let used = 0;
  for (const seg of SEGMENTS) {
    const p = progress.drivers[seg.key];
    if (p && p >= end) continue;
    if (used >= Math.ceil(BUDGET / 3)) break;
    used++;
    const start = p || `${START_YEAR}-01-01`;
    try {
      const a = JSON.parse(await fetchText(`https://archive-api.open-meteo.com/v1/archive?latitude=${seg.lat}&longitude=${seg.lon}&start_date=${start}&end_date=${end}&daily=wind_speed_10m_mean,wind_direction_10m_dominant&wind_speed_unit=ms&timezone=UTC`));
      // Surface currents (history available from roughly 2022 on); hourly -> daily mean vector.
      const cur = {};
      try {
        const cs = start < "2022-01-01" ? "2022-01-01" : start;
        const m = JSON.parse(await fetchText(`https://marine-api.open-meteo.com/v1/marine?latitude=${seg.lat}&longitude=${seg.lon}&start_date=${cs}&end_date=${end}&hourly=ocean_current_velocity,ocean_current_direction&timezone=UTC`));
        m.hourly.time.forEach((t, i) => {
          const v = m.hourly.ocean_current_velocity[i], dir = m.hourly.ocean_current_direction[i];
          if (v == null || dir == null) return;
          const ms = v / 3.6, r = (dir * Math.PI) / 180; // km/h -> m/s; direction the current flows TO
          const d = (cur[t.slice(0, 10)] ||= [0, 0, 0]);
          d[0] += ms * Math.sin(r); d[1] += ms * Math.cos(r); d[2]++;
        });
      } catch (e) { console.warn(`currents ${seg.key}: ${e.message.slice(0, 120)}`); }
      const f = `drivers/${seg.key}.csv`;
      if (!existsSync(DIR + f)) await writeFile(DIR + f, "date,wind_u,wind_v,cur_u,cur_v\n");
      const lines = a.daily.time.map((t, i) => {
        const sp = a.daily.wind_speed_10m_mean[i], from = a.daily.wind_direction_10m_dominant[i];
        const r = (((from ?? 0) + 180) * Math.PI) / 180; // wind blows TOWARD from+180
        const c = cur[t];
        return [t, sp == null ? "" : (sp * Math.sin(r)).toFixed(2), sp == null ? "" : (sp * Math.cos(r)).toFixed(2), c ? (c[0] / c[2]).toFixed(3) : "", c ? (c[1] / c[2]).toFixed(3) : ""].join(",");
      });
      await appendFile(DIR + f, lines.join("\n") + "\n");
      progress.drivers[seg.key] = iso(new Date(Date.parse(end) + 864e5));
      await writeJSON("progress.json", progress);
    } catch (e) { console.warn(`drivers ${seg.key}: ${e.message.slice(0, 160)}`); }
    await sleep(2500);
  }
  const ready = SEGMENTS.filter((s) => (progress.drivers[s.key] || "") >= end).length;
  console.log(`drivers: ${ready}/${SEGMENTS.length} segments up to date, ${used} fetched this run`);
}

async function latest() {
  const m = await meta7();
  const { last } = timeStride(m);
  const t = iso(last), out = { date: t, generated: new Date().toISOString(), cols: SAT_COLS, segments: {} };
  for (const seg of SEGMENTS) {
    try {
      const rows = summarize(await fetchText(boxQuery(m, { lat: seg.lat, lon: seg.lon, t0: t, t1: t })), m, seg);
      if (rows[0]) out.segments[seg.key] = satRow(rows[0]).split(",").slice(1).map((v) => (v === "" ? null : +v));
    } catch (e) { console.warn(`latest ${seg.key}: ${e.message.slice(0, 120)}`); }
    await sleep(800);
  }
  await writeJSON("latest.json", out);
  console.log(`latest composite ${t}: ${Object.keys(out.segments).length}/${SEGMENTS.length} segments`);
}

await mkdir(DIR, { recursive: true });
const mode = process.argv[2] || "smoke";
await ({ smoke, discover: meta7, backfill, drivers, latest }[mode] ?? (() => { throw new Error(`unknown mode ${mode}`); }))();
