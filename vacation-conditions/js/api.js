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
