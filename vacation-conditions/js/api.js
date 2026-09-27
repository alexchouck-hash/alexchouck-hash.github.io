// Live weather for vacation destinations (Open-Meteo, no key), including
// snowfall and snow depth for ski areas.

import { getJSON } from "../../js/api.js";

const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,cloud_cover_mean,wind_speed_10m_max,uv_index_max,sunrise,sunset";
const CURRENT = "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,snowfall,precipitation,uv_index";

export async function forecast(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${CURRENT}&daily=${DAILY}&hourly=snow_depth&forecast_days=16&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
  const j = await getJSON(u, 15);
  const d = j.daily, days = {};
  d.time.forEach((t, i) => {
    days[t] = {
      code: d.weather_code[i], tmaxF: Math.round(d.temperature_2m_max[i]), tminF: Math.round(d.temperature_2m_min[i]),
      precipProb: d.precipitation_probability_max[i], precipIn: d.precipitation_sum[i],
      snowIn: d.snowfall_sum[i] != null ? Math.round(d.snowfall_sum[i] * 10) / 10 : 0,
      cloud: d.cloud_cover_mean?.[i], windMph: Math.round(d.wind_speed_10m_max[i]), uv: d.uv_index_max[i],
      sunrise: d.sunrise[i]?.slice(11), sunset: d.sunset[i]?.slice(11),
    };
  });
  // Latest modeled snow depth (m) at the grid point; valley grids under-read mountains.
  const sd = j.hourly?.snow_depth || [];
  const now = j.current?.time?.slice(0, 13);
  const idx = Math.max(0, j.hourly?.time?.findIndex((t) => t.slice(0, 13) === now) ?? 0);
  const depthM = sd[idx] ?? null;
  return { current: j.current, days, live: { snowDepthIn: depthM != null ? Math.round(depthM * 39.37) : null } };
}

// Daily max US AQI (smoke, ozone, particulates) for the next ~5 days.
export async function airQuality(lat, lon) {
  const j = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5&hourly=us_aqi,pm2_5&forecast_days=5&timezone=auto`, 30);
  const days = {};
  j.hourly.time.forEach((t, i) => {
    const k = t.slice(0, 10), a = j.hourly.us_aqi[i], p = j.hourly.pm2_5[i];
    if (a == null) return;
    const d = (days[k] ||= { aqi: 0, pm25: 0 });
    d.aqi = Math.max(d.aqi, Math.round(a)); d.pm25 = Math.max(d.pm25, Math.round(p ?? 0));
  });
  return { current: j.current, days };
}

// NOAA SWPC geomagnetic outlook: max Kp per UTC day from the 3-day forecast,
// extended with the 27-day outlook. Returns { "YYYY-MM-DD": kp }.
export async function spaceWeather() {
  const out = {};
  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  try {
    const res = await fetch("https://services.swpc.noaa.gov/text/27-day-outlook.txt");
    if (res.ok) for (const m of (await res.text()).matchAll(/^(\d{4}) (\w{3}) (\d{2})\s+\d+\s+\d+\s+(\d)/gm)) {
      out[`${m[1]}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[3]}`] = +m[4];
    }
  } catch {}
  try {
    const j = await getJSON("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json", 60);
    const rows = Array.isArray(j[0]) ? j.slice(1).map((r) => ({ time_tag: r[0], kp: r[1] })) : j;
    const near = {};
    for (const r of rows) { const k = String(r.time_tag).slice(0, 10), v = +r.kp; if (!isNaN(v)) near[k] = Math.max(near[k] ?? 0, v); }
    // The 3-hourly 3-day forecast is more precise than the 27-day outlook for its dates.
    for (const [k, v] of Object.entries(near)) out[k] = Math.round(v);
  } catch {}
  return out;
}
