// Season context per resort from ERA5 reanalysis (Open-Meteo archive, no key):
//  - weekly snowfall normals at the summit over the last 10 seasons;
//  - this season's snowfall to date and the normal to the same date.
// Writes ski/climate/<id>.json. Normals are refreshed every 30 days (CLIMATE_BUDGET
// resorts per run); season-to-date is refreshed every run.
// ERA5 (~25 km) smooths mountain precipitation, so treat totals as relative:
// "% of normal" is the meaningful number, not the absolute centimetres.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RESORTS } from "../js/resorts.js";
import { dailySnowFromMean, seasonStart } from "../js/model.js";

const root = new URL((process.env.FEED_DIR || "feed").replace(/\/?$/, "/") + "ski/climate/", new URL("../../", import.meta.url));
const BUDGET = +(process.env.CLIMATE_BUDGET ?? 10), YEARS = 10, MAX_AGE = 30 * 864e5;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(s + "T12:00Z") + n * 864e5));
const TODAY = iso(new Date()), END = addDays(TODAY, -6); // ERA5 lags ~5 days
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status < 500 && r.status !== 429) throw new Error(`${r.status}`); } catch (e) { if (i >= 3 || /^\d{3}$/.test(e.message)) throw e; }
    await sleep(3000 * 2 ** i);
  }
}
const archive = (r, a, b) => get(`https://archive-api.open-meteo.com/v1/archive?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.summit}&start_date=${a}&end_date=${b}&daily=precipitation_sum,temperature_2m_mean&timezone=auto`);
const snowSeries = (j) => j.daily.time.map((t, i) => [t, dailySnowFromMean(j.daily.precipitation_sum[i], j.daily.temperature_2m_mean[i])]);

// Day index within a season (0 = season start), comparable across years.
const seasonDay = (lat, t) => Math.round((Date.parse(t) - Date.parse(seasonStart(lat, t))) / 864e5);

export function normalsFrom(lat, series) {
  const byDay = Array.from({ length: 366 }, () => []);
  const seasons = new Set();
  for (const [t, s] of series) { byDay[seasonDay(lat, t)].push(s); seasons.add(seasonStart(lat, t)); }
  const n = Math.max(1, seasons.size);
  const daily = byDay.map((v) => v.reduce((a, x) => a + x, 0) / n);
  const cumulative = []; daily.reduce((a, v, k) => (cumulative[k] = a + v), 0);
  const weekly = Array.from({ length: 52 }, (_, w) => +daily.slice(w * 7, w * 7 + 7).reduce((a, v) => a + v, 0).toFixed(1));
  return { seasons: seasons.size, weekly, cumulative: cumulative.map((v) => +v.toFixed(1)) };
}

// CLIMATE_NO_MAIN=1 lets tests import normalsFrom without running the job.
if (process.env.CLIMATE_NO_MAIN !== "1") {
await mkdir(root, { recursive: true });
const read = async (id) => { try { return JSON.parse(await readFile(new URL(`${id}.json`, root), "utf8")); } catch { return null; } };
let normalsBuilt = 0, updated = 0;
for (const r of RESORTS) {
  const prev = await read(r.id);
  let normals = prev?.normals;
  try {
    if ((!normals || Date.now() - Date.parse(prev.normalsUpdated) > MAX_AGE) && normalsBuilt < BUDGET) {
      const start = seasonStart(r.lat, addDays(TODAY, -365 * YEARS));
      const end = addDays(seasonStart(r.lat, TODAY), -1);
      normals = normalsFrom(r.lat, snowSeries(await archive(r, start, end)));
      normals.from = start; normals.to = end; normalsBuilt++;
      await sleep(1500);
    }
    if (!normals) continue;
    const s0 = seasonStart(r.lat, TODAY);
    let toDate = 0, through = null;
    if (END >= s0) { const j = await archive(r, s0, END); for (const [t, s] of snowSeries(j)) { toDate += s; through = t; } }
    const day = through ? seasonDay(r.lat, through) : -1;
    const normalToDate = day >= 0 ? normals.cumulative[day] : 0;
    const week = Math.min(51, Math.floor(Math.max(0, seasonDay(r.lat, TODAY)) / 7));
    await writeFile(new URL(`${r.id}.json`, root), JSON.stringify({
      updated: new Date().toISOString(), normalsUpdated: normals === prev?.normals ? prev.normalsUpdated : new Date().toISOString(),
      source: "ERA5 reanalysis via Open-Meteo, summit elevation; relative use only", seasonStart: s0,
      season: { toDate: +toDate.toFixed(1), through, normalToDate: +normalToDate.toFixed(1), pctOfNormal: normalToDate >= 5 ? Math.round((toDate / normalToDate) * 100) : null },
      thisWeek: { index: week, normal: normals.weekly[week] },
      normals,
    }));
    updated++;
  } catch (e) { console.warn(`${r.id}: ${e.message}`); }
  await sleep(700);
}
console.log(`climate: ${updated} resorts updated, ${normalsBuilt} normals built`);
}
