// Builds the static JSON data feed under data/ for every resort.
// Run: node scripts/build-data.mjs   (Node 18+; used by .github/workflows/data.yml)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RESORTS, REGIONS, CLEANUP, TOURISM, AIRPORTS } from "../js/resorts.js";
import { iso, addDays, doy, buildDay, normalsFromArchive } from "../js/model.js";
import * as api from "../js/api.js";

const root = new URL("../data/", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = new Date();
const TODAY = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));

async function normals(r) {
  const f = new URL(`normals/${r.id}.json`, root);
  try {
    const j = JSON.parse(await readFile(f, "utf8"));
    if (Date.now() - Date.parse(j.generated) < 30 * 86400000) return j.normals;
  } catch {}
  const h = await api.history(r.lat, r.lon, api.marinePoint(r));
  const n = normalsFromArchive(h.daily, h.marine);
  await writeFile(f, JSON.stringify({ generated: new Date().toISOString(), normals: n }));
  await sleep(1500);
  return n;
}

// Save successful raw pulls; on failure fall back to the previous pull if it
// is under 24 hours old (marked stale in the output).
async function lastGood(r, kind, result) {
  const f = new URL(`last/${r.id}.${kind}.json`, root);
  if (result.status === "fulfilled") {
    await writeFile(f, JSON.stringify({ fetched: new Date().toISOString(), v: result.value }));
    return result.value;
  }
  console.warn(`${kind} ${r.id}: ${result.reason?.message}`);
  try {
    const j = JSON.parse(await readFile(f, "utf8"));
    if (Date.now() - Date.parse(j.fetched) < 86400000) return { ...j.v, stale: true, fetched: j.fetched };
  } catch {}
  return null;
}

async function build(r) {
  const [fc, mar, alerts] = await Promise.allSettled([
    api.forecast(r.lat, r.lon), api.marine(...api.marinePoint(r)),
    REGIONS[r.region].country === "US" ? api.nwsAlerts(r.lat, r.lon) : Promise.resolve([]),
  ]);
  let nm = null;
  try { nm = await normals(r); } catch (e) { console.warn(`normals ${r.id}: ${e.message}`); }
  // Keep the last successful live pull so one failed request doesn't blank a resort.
  const F = await lastGood(r, "forecast", fc), M = await lastGood(r, "marine", mar);
  const days = Array.from({ length: 366 }, (_, i) => {
    const d = addDays(TODAY, i), k = iso(d);
    return buildDay(r, d, TODAY, { fc: F?.days[k] || null, marine: M?.days[k] || null, nm: nm?.[doy(d)] || null });
  });
  const out = {
    meta: { generated: new Date().toISOString(), units: { temp: "F", wave: "ft", precip: "in", wind: "mph" }, sources: ["Open-Meteo forecast/marine/ERA5 archive", "NOAA NWS alerts", "Sargassum & crowd models (see js/model.js)"] },
    resort: { ...r, regionName: REGIONS[r.region].name, airports: r.airports.map((a) => ({ code: a, name: AIRPORTS[a][0] })) },
    cleanup: CLEANUP[r.region], tourism: TOURISM[r.region],
    current: { weather: F?.current ?? null, marine: M?.current ?? null, staleSince: { weather: F?.stale ? F.fetched : null, marine: M?.stale ? M.fetched : null }, alerts: alerts.status === "fulfilled" ? alerts.value : [] },
    days,
  };
  await writeFile(new URL(`resorts/${r.id}.json`, root), JSON.stringify(out));
  const t = days[0];
  return { id: r.id, name: r.name, city: r.city, region: r.region, lat: r.lat, lon: r.lon, today: { sargassum: t.sargassum.label, sargassumScore: t.sargassum.score, tmaxF: t.weather.tmaxF, sstF: t.ocean.sstF, waveFt: t.ocean.waveFt, uv: t.weather.uv, crowd: t.crowds.resort.label }, url: `resorts/${r.id}.json` };
}

await mkdir(new URL("resorts/", root), { recursive: true });
await mkdir(new URL("normals/", root), { recursive: true });
await mkdir(new URL("last/", root), { recursive: true });
const index = [];
for (const r of RESORTS) {
  try { index.push(await build(r)); console.log("ok", r.id); } catch (e) { console.error("fail", r.id, e.message); }
  await sleep(400);
}
await writeFile(new URL("index.json", root), JSON.stringify({ generated: new Date().toISOString(), count: index.length, resorts: index }, null, 1));
