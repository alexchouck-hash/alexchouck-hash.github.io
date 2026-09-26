// Network layer: free, key-less public APIs (Open-Meteo, NOAA/NWS).
// Works in browsers and in Node 18+ (global fetch). Browser responses are
// cached in localStorage with a TTL.

import { iso, addDays, cToF } from "./model.js";

const store = typeof localStorage !== "undefined" ? localStorage : null;

async function getJSON(url, ttlMin = 10) {
  const key = "gsf:" + url;
  if (store && ttlMin > 0) {
    try {
      const hit = JSON.parse(store.getItem(key) || "null");
      if (hit && Date.now() - hit.t < ttlMin * 60000) return hit.v;
    } catch {}
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const v = await res.json();
  if (store && ttlMin > 0) {
    try { store.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* quota: ignore */ }
  }
  return v;
}

const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,cloud_cover_mean,uv_index_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,relative_humidity_2m_mean,sunrise,sunset";
const CURRENT = "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day";
const HOURLY = "temperature_2m,precipitation_probability,cloud_cover,uv_index,wind_speed_10m";

// 16-day weather forecast + current conditions (US units).
export async function forecast(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}&forecast_days=16&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
  const j = await getJSON(u, 10);
  const d = j.daily;
  const days = {};
  d.time.forEach((t, i) => {
    days[t] = {
      code: d.weather_code[i], tmaxF: Math.round(d.temperature_2m_max[i]), tminF: Math.round(d.temperature_2m_min[i]), feelsF: Math.round(d.apparent_temperature_max[i]),
      precipIn: d.precipitation_sum[i], precipProb: d.precipitation_probability_max[i], cloud: d.cloud_cover_mean?.[i], uv: d.uv_index_max[i],
      windMph: Math.round(d.wind_speed_10m_max[i]), gustMph: Math.round(d.wind_gusts_10m_max[i]), windDir: d.wind_direction_10m_dominant[i],
      rh: d.relative_humidity_2m_mean?.[i], sunrise: d.sunrise[i]?.slice(11), sunset: d.sunset[i]?.slice(11),
    };
  });
  return { current: j.current, days, hourly: j.hourly, tz: j.timezone };
}

// 8-day marine forecast + current sea state. Heights converted to feet.
export async function marine(lat, lon) {
  const u = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&hourly=sea_surface_temperature&daily=wave_height_max,wave_period_max,wave_direction_dominant,swell_wave_height_max&forecast_days=8&timezone=auto`;
  const j = await getJSON(u, 20);
  const ft = (m) => (m == null ? null : Math.round(m * 3.281 * 10) / 10);
  const sstByDay = {};
  j.hourly.time.forEach((t, i) => {
    const k = t.slice(0, 10); const v = j.hourly.sea_surface_temperature[i];
    if (v == null) return; (sstByDay[k] ||= []).push(v);
  });
  const days = {};
  j.daily.time.forEach((t, i) => {
    const s = sstByDay[t];
    days[t] = { waveFt: ft(j.daily.wave_height_max[i]), periodS: j.daily.wave_period_max[i], waveDir: j.daily.wave_direction_dominant[i], swellFt: ft(j.daily.swell_wave_height_max[i]), sstF: s ? cToF(s.reduce((a, b) => a + b, 0) / s.length) : null };
  });
  const c = j.current;
  return {
    current: { waveFt: ft(c.wave_height), waveDir: c.wave_direction, periodS: c.wave_period, swellFt: ft(c.swell_wave_height), sstF: c.sea_surface_temperature != null ? cToF(c.sea_surface_temperature) : null, currentKmh: c.ocean_current_velocity, currentDir: c.ocean_current_direction, time: c.time },
    days,
  };
}

// ~10 years of daily history (ERA5) for climate normals, plus 3 years of
// marine history for water temperature / wave normals.
export async function history(lat, lon) {
  const end = iso(addDays(new Date(), -7));
  const start = iso(addDays(new Date(), -365 * 10));
  const a = await getJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,cloud_cover_mean,wind_speed_10m_max,shortwave_radiation_sum,weather_code,relative_humidity_2m_mean&timezone=auto`, 0);
  let m = null;
  try {
    const mstart = iso(addDays(new Date(), -365 * 3));
    const mj = await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&start_date=${mstart}&end_date=${end}&daily=wave_height_max&hourly=sea_surface_temperature&timezone=auto`, 0);
    const sst = {};
    mj.hourly.time.forEach((t, i) => { const v = mj.hourly.sea_surface_temperature[i]; if (v != null) (sst[t.slice(0, 10)] ||= []).push(v); });
    m = { time: mj.daily.time, wave: mj.daily.wave_height_max, sst: mj.daily.time.map((t) => sst[t] ? sst[t].reduce((a, b) => a + b, 0) / sst[t].length : null) };
  } catch { /* marine history optional */ }
  return { daily: a.daily, marine: m };
}

// Batched overview for many points in one request (map markers).
export async function overview(points) {
  const lat = points.map((p) => p.lat).join(","), lon = points.map((p) => p.lon).join(",");
  const [w, m] = await Promise.allSettled([
    getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,uv_index&daily=weather_code,temperature_2m_max,precipitation_probability_max,wind_direction_10m_dominant,wind_speed_10m_max,uv_index_max&forecast_days=16&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph`, 15),
    getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,sea_surface_temperature&daily=wave_height_max&forecast_days=8&timezone=auto`, 30),
  ]);
  const arr = (r) => (r.status === "fulfilled" ? (Array.isArray(r.value) ? r.value : [r.value]) : []);
  return { weather: arr(w), marine: arr(m) };
}

// Active NWS alerts (US only): rip current statements, beach hazards,
// tropical warnings, heat advisories, etc.
export async function nwsAlerts(lat, lon) {
  const j = await getJSON(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, 5);
  return j.features.map((f) => ({ event: f.properties.event, headline: f.properties.headline, severity: f.properties.severity, ends: f.properties.ends || f.properties.expires, description: f.properties.description }));
}
