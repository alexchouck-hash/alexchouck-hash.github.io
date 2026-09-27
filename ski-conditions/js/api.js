// Network: Open-Meteo multi-model forecast + elevation, OpenStreetMap runs via Overpass.
// All key-less and CORS-enabled. Browser responses are cached in localStorage.
import { MODELS, HOURLY_VARS, blend, runsFromOSM, finishRun } from "./model.js";

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
export async function forecast(resort) {
  const mid = Math.round((resort.base + resort.summit) / 2);
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${resort.lat}&longitude=${resort.lon}&elevation=${mid}` +
    `&hourly=${HOURLY_VARS.join(",")}&models=${Object.keys(MODELS).join(",")}&past_days=7&forecast_days=10&timezone=auto`;
  return blend(await getJSON(u, 30));
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
export async function runs(resort) {
  const q = `[out:json][timeout:40];way["piste:type"="downhill"](around:${resort.r * 1000},${resort.lat},${resort.lon});out geom;`;
  let j, err;
  for (const url of OVERPASS) {
    try { j = await getJSON(url, 60 * 24 * 7, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }); break; } catch (e) { err = e; }
  }
  if (!j) throw err;
  const list = runsFromOSM(j.elements).slice(0, 250);
  const el = await elevations(list.flatMap((r) => r.samples));
  return list.map((r, k) => finishRun(r, el.slice(k * 5, k * 5 + 5)));
}

// Light global leaderboard: next 7 days of snowfall at every summit, one request.
export async function leaderboard(resorts) {
  const q = (f) => resorts.map(f).join(",");
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${q((r) => r.lat)}&longitude=${q((r) => r.lon)}&elevation=${q((r) => r.summit)}&daily=snowfall_sum,temperature_2m_max&forecast_days=7&timezone=auto`;
  const j = await getJSON(u, 60);
  return (Array.isArray(j) ? j : [j]).map((x, k) => ({ id: resorts[k].id, days: x.daily.time, snow: x.daily.snowfall_sum, tmax: x.daily.temperature_2m_max }));
}
