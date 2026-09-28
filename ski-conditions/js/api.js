// Network: Open-Meteo multi-model forecast + elevation, OpenStreetMap runs via Overpass.
// All key-less and CORS-enabled. Browser responses are cached in localStorage.
import { MODELS, HOURLY_VARS, blend, regionalFor, runsFromOSM, finishRun } from "./model.js";
import { liftsFromOSM } from "./ops.js";

// Prebuilt data (verification, trail maps) published on the data-feed branch.
export const FEED_BASE = "https://raw.githubusercontent.com/alexchouck-hash/alexchouck-hash.github.io/data-feed/";
const store = typeof localStorage !== "undefined" ? localStorage : null;
async function getJSON(url, ttlMin, init) {
  const key = "ski:" + url + (init?.body || "");
  if (store) { try { const hit = JSON.parse(store.getItem(key) || "null"); if (hit && Date.now() - hit.t < ttlMin * 60000) return hit.v; } catch {} }
  let v;
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) { v = await res.json(); break; }
      if (res.status !== 429 && res.status < 500) throw Object.assign(new Error(`${res.status} ${url}`), { fatal: true });
      if (i >= 3) throw new Error(`${res.status} ${url}`);
    } catch (e) { if (e.fatal || i >= 3) throw e; }
    await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
  }
  if (store) { try { store.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {} }
  return v;
}

// Hourly forecast from several models at the resort's mid-mountain elevation,
// with 7 past days so the snowpack simulation has recent history.
// High-res regional models come from a second, optional request so an
// unavailable model can never break the main forecast.
export async function forecast(resort, ttlMin = 30, weights = {}) {
  const mid = Math.round((resort.base + resort.summit) / 2);
  const u = (models) => `https://api.open-meteo.com/v1/forecast?latitude=${resort.lat}&longitude=${resort.lon}&elevation=${mid}` +
    `&hourly=${HOURLY_VARS.join(",")}&models=${models.join(",")}&past_days=7&forecast_days=10&timezone=auto`;
  const reg = regionalFor(resort);
  const [main, regional] = await Promise.all([getJSON(u(Object.keys(MODELS)), ttlMin), reg.length ? getJSON(u(reg), ttlMin).catch(() => null) : null]);
  return blend(main, regional, weights);
}

export async function elevations(points) {
  const out = [];
  for (let k = 0; k < points.length; k += 100) {
    const p = points.slice(k, k + 100);
    const j = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${p.map((x) => x[0].toFixed(5)).join(",")}&longitude=${p.map((x) => x[1].toFixed(5)).join(",")}`, 60 * 24 * 30);
    out.push(...j.elevation);
  }
  return out;
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
// Downhill runs from OpenStreetMap with elevation, aspect and slope per run.
// Runs and lifts, precomputed weekly by scripts/build-runs.mjs; live OSM fallback.
export async function mapData(resort) {
  try { const j = await getJSON(`${FEED_BASE}ski/runs/${resort.id}.json`, 60 * 24); if (j.runs?.length) return { runs: j.runs, lifts: j.lifts || [] }; } catch {}
  return liveMap(resort);
}
export const runs = async (resort) => (await mapData(resort)).runs;
export async function liveMap(resort) {
  const around = `(around:${resort.r * 1000},${resort.lat},${resort.lon})`;
  const q = `[out:json][timeout:40];(way["piste:type"="downhill"]${around};way["aerialway"]${around};);out geom;`;
  let j, err;
  for (const url of OVERPASS) {
    try { j = await getJSON(url, 60 * 24 * 7, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }); break; } catch (e) { err = e; }
  }
  if (!j) throw err;
  const list = runsFromOSM(j.elements).slice(0, 250);
  const lifts = liftsFromOSM(j.elements).slice(0, 80);
  const el = await elevations([...list.flatMap((r) => r.samples), ...lifts.flatMap((l) => l.ends)]);
  const runs = list.map((r, k) => finishRun(r, el.slice(k * 5, k * 5 + 5)));
  const off = list.length * 5;
  lifts.forEach((l, k) => { l.bottom = Math.round(el[off + 2 * k]); l.top = Math.round(el[off + 2 * k + 1]); if (l.top < l.bottom) [l.top, l.bottom] = [l.bottom, l.top]; delete l.ends; });
  return { runs, lifts };
}
export const liveRuns = async (resort) => (await liveMap(resort)).runs;

// Light global leaderboard: next 7 days of snowfall at every summit, one request.
export async function leaderboard(resorts) {
  const q = (f) => resorts.map(f).join(",");
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${q((r) => r.lat)}&longitude=${q((r) => r.lon)}&elevation=${q((r) => r.summit)}&daily=snowfall_sum,temperature_2m_max&forecast_days=7&timezone=auto`;
  const j = await getJSON(u, 60);
  return (Array.isArray(j) ? j : [j]).map((x, k) => ({ id: resorts[k].id, days: x.daily.time, snow: x.daily.snowfall_sum, tmax: x.daily.temperature_2m_max }));
}

// Verification scores published by ski-conditions/scripts/verify.mjs on the data-feed branch.
export const verification = () => getJSON(FEED_BASE + "ski/verification.json", 60);
