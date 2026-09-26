// Pure forecasting models shared by the browser app and the data-feed builder.
// Nothing here touches the network or the DOM.

import { REGIONS, CLEANUP, SAFETY } from "./resorts.js";

// ---------- date helpers ----------
export const DAY = 86400000;
export const iso = (d) => d.toISOString().slice(0, 10);
export const parseISO = (s) => new Date(s + "T12:00:00Z");
export const addDays = (d, n) => new Date(d.getTime() + n * DAY);
export const doy = (d) => Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;

// Smoothly interpolate a 12-value monthly table to a specific date (values
// are treated as mid-month).
export function monthly(table, d) {
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const dim = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
  const pos = (day - 0.5) / dim - 0.5; // -0.5..0.5 around mid-month
  const other = pos < 0 ? (m + 11) % 12 : (m + 1) % 12;
  return lerp(table[m], table[other], Math.abs(pos));
}

// Anonymous Gregorian algorithm.
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day, 12));
}
function nthWeekday(y, m, wd, n) { // n = -1 for last
  if (n > 0) {
    const first = new Date(Date.UTC(y, m, 1, 12));
    return addDays(first, ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(Date.UTC(y, m + 1, 0, 12));
  return addDays(last, -((last.getUTCDay() - wd + 7) % 7));
}

// ---------- holidays & events ----------
// Returns [{start, end, name, us, mx, travel}] where us/mx are demand weights
// (0..1) for US and Mexican travelers, travel marks peak airport days.
const holidayCache = new Map();
export function holidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const D = (m, d) => new Date(Date.UTC(y, m, d, 12));
  const e = easter(y);
  const thanks = nthWeekday(y, 10, 4, 4);
  const list = [
    { start: D(0, 1), end: D(0, 4), name: "New Year holiday", us: 0.5, mx: 0.8, travel: true },
    { start: addDays(nthWeekday(y, 0, 1, 3), -2), end: nthWeekday(y, 0, 1, 3), name: "MLK weekend", us: 0.35, mx: 0 },
    { start: addDays(nthWeekday(y, 1, 1, 3), -2), end: nthWeekday(y, 1, 1, 3), name: "Presidents' Day weekend", us: 0.4, mx: 0 },
    { start: addDays(e, -47 - 4), end: addDays(e, -47), name: "Mardi Gras / Carnaval", us: 0.35, mx: 0.4, cities: ["Pensacola", "Mobile", "Galveston", "New Orleans", "Veracruz", "Campeche", "Biloxi", "Orange Beach"] },
    { start: D(2, 1), end: D(2, 31), name: "College & school spring break", us: 0.55, mx: 0 },
    { start: addDays(e, -9), end: addDays(e, 1), name: "Semana Santa / Easter", us: 0.35, mx: 1.0, travel: true },
    { start: addDays(nthWeekday(y, 4, 1, -1), -3), end: nthWeekday(y, 4, 1, -1), name: "Memorial Day weekend", us: 0.7, mx: 0, travel: true },
    { start: D(5, 1), end: D(7, 10), name: "US summer school break", us: 0.25, mx: 0 },
    { start: D(6, 10), end: D(7, 20), name: "Mexico summer vacation", us: 0, mx: 0.45 },
    { start: D(6, 2), end: D(6, 6), name: "Independence Day (US)", us: 0.7, mx: 0, travel: true },
    { start: addDays(nthWeekday(y, 8, 1, 1), -3), end: nthWeekday(y, 8, 1, 1), name: "Labor Day weekend", us: 0.55, mx: 0, travel: true },
    { start: D(8, 14), end: D(8, 16), name: "Mexican Independence Day", us: 0, mx: 0.5 },
    { start: D(9, 31), end: D(10, 2), name: "Día de Muertos", us: 0.1, mx: 0.5 },
    { start: addDays(thanks, -1), end: addDays(thanks, 3), name: "Thanksgiving", us: 0.6, mx: 0, travel: true },
    { start: D(11, 12), end: D(11, 12), name: "Día de la Virgen de Guadalupe", us: 0, mx: 0.3 },
    { start: D(11, 20), end: D(11, 31), name: "Christmas & holiday break", us: 0.75, mx: 0.8, travel: true },
  ];
  holidayCache.set(y, list);
  return list;
}
export function holidaysOn(d) {
  return holidays(d.getUTCFullYear()).filter((h) => d >= addDays(h.start, -0.6) && d <= addDays(h.end, 0.6));
}

// ---------- sargassum ----------
// Seasonal landing likelihood by basin (monthly, 0..1). Based on the
// published seasonality of the Great Atlantic Sargassum Belt (USF Optical
// Oceanography Lab / NOAA AOML), which peaks Jun–Jul in the Caribbean and
// spreads into the western and northern Gulf through summer.
export const SARG_SEASON = {
  carib: [0.15, 0.18, 0.32, 0.55, 0.85, 1.0, 1.0, 0.9, 0.65, 0.4, 0.22, 0.15],
  gulf_w: [0.05, 0.05, 0.15, 0.4, 0.75, 0.95, 0.9, 0.7, 0.45, 0.2, 0.08, 0.05],
  gulf_n: [0.02, 0.02, 0.05, 0.2, 0.45, 0.75, 0.9, 0.8, 0.5, 0.2, 0.05, 0.02],
  gulf_e: [0.02, 0.02, 0.05, 0.15, 0.35, 0.6, 0.75, 0.7, 0.45, 0.2, 0.05, 0.02],
  gulf_s: [0.05, 0.05, 0.1, 0.3, 0.55, 0.75, 0.8, 0.7, 0.45, 0.2, 0.08, 0.05],
};
// Year-to-year bloom intensity multiplier. 2025 set records; keep elevated
// until the USF monthly outlook says otherwise. Update as bulletins arrive.
export const ANNUAL_INTENSITY = { 2026: 1.1, 2027: 1.0 };

// Barrier / cleanup effectiveness at resort frontage (fraction removed by
// morning on a typical day).
const CLEANUP_EFFECT = { mx_cun: 0.6, mx_rm: 0.45, fl_sw: 0.6, fl_tb: 0.55, fl_ph: 0.55, al_ms: 0.65, la: 0.2, tx_up: 0.55, tx_lo: 0.55, fl_keys: 0.55, mx_yuc: 0.4, mx_ver: 0.35, cu: 0.5 };

export const SARG_LEVELS = [
  [10, "Very low", "#2e9e6b"], [25, "Low", "#8bbf3f"], [45, "Moderate", "#e3b52a"], [70, "High", "#e0772b"], [101, "Very high", "#c8372d"],
];
export const level = (score, levels = SARG_LEVELS) => levels.find((l) => score < l[0]) || levels[levels.length - 1];

// Onshore factor from wind: +1 straight onshore, -1 offshore.
export function onshore(facing, windFromDeg) {
  if (windFromDeg == null || facing == null) return 0;
  return Math.cos(((windFromDeg - facing) * Math.PI) / 180);
}

export function sargassum(resort, d, { windDir, windMph, daysOut = 999 } = {}) {
  const season = monthly(SARG_SEASON[resort.basin], d);
  const intensity = ANNUAL_INTENSITY[d.getUTCFullYear()] ?? 1.0;
  let windFactor = 1;
  if (windDir != null && windMph != null) {
    const on = onshore(resort.facing, windDir);
    windFactor = 1 + 0.45 * on * clamp(windMph / 18, 0.2, 1);
  }
  const score = Math.round(clamp(season * resort.exposure * intensity * windFactor * 100, 0, 100));
  const effect = CLEANUP_EFFECT[resort.region] ?? 0.4;
  const afterCleanup = Math.round(score * (1 - effect));
  const confidence = daysOut <= 7 ? "moderate (wind-adjusted)" : daysOut <= 30 ? "low-moderate (seasonal + monthly outlook)" : "low (climatology)";
  const [, label, color] = level(score);
  const [, afterLabel] = level(afterCleanup);
  return {
    score, label, color,
    seasonal: Math.round(season * 100),
    windAdjusted: windFactor !== 1,
    onshoreWind: windDir != null ? onshore(resort.facing, windDir) > 0.3 : null,
    beachAfterCleanup: afterCleanup, beachAfterCleanupLabel: afterLabel,
    smellRisk: score >= 45 ? "Possible hydrogen-sulfide odor near piles" : "Unlikely",
    confidence,
    cleanup: CLEANUP[resort.region],
  };
}

// ---------- crowds ----------
const CROWD_BASE = {
  fl_sw: [0.8, 0.95, 1.0, 0.8, 0.5, 0.45, 0.55, 0.5, 0.3, 0.4, 0.55, 0.7],
  fl_tb: [0.6, 0.75, 0.95, 0.8, 0.6, 0.7, 0.8, 0.6, 0.35, 0.45, 0.5, 0.6],
  fl_ph: [0.2, 0.3, 0.75, 0.6, 0.7, 1.0, 1.0, 0.75, 0.45, 0.5, 0.3, 0.25],
  al_ms: [0.2, 0.3, 0.7, 0.6, 0.7, 1.0, 1.0, 0.7, 0.45, 0.5, 0.3, 0.25],
  la: [0.1, 0.15, 0.3, 0.4, 0.6, 0.8, 0.8, 0.6, 0.35, 0.3, 0.15, 0.1],
  tx_up: [0.2, 0.3, 0.7, 0.55, 0.7, 1.0, 1.0, 0.75, 0.4, 0.35, 0.25, 0.25],
  tx_lo: [0.35, 0.45, 1.0, 0.5, 0.6, 0.9, 0.95, 0.7, 0.35, 0.35, 0.35, 0.35],
  fl_keys: [0.85, 0.95, 1.0, 0.85, 0.6, 0.55, 0.65, 0.55, 0.3, 0.45, 0.6, 0.85],
  mx_cun: [0.9, 0.95, 1.0, 0.85, 0.55, 0.6, 0.85, 0.8, 0.35, 0.45, 0.65, 0.95],
  mx_rm: [0.9, 0.95, 1.0, 0.85, 0.55, 0.6, 0.85, 0.8, 0.35, 0.45, 0.65, 0.95],
  mx_yuc: [0.5, 0.5, 0.6, 0.8, 0.5, 0.5, 0.9, 0.85, 0.3, 0.35, 0.45, 0.7],
  mx_ver: [0.4, 0.35, 0.5, 0.9, 0.5, 0.5, 0.9, 0.85, 0.3, 0.35, 0.4, 0.7],
  cu: [0.9, 0.95, 0.95, 0.8, 0.5, 0.5, 0.7, 0.7, 0.35, 0.4, 0.6, 0.9],
};
// Share of visitors from the US vs Mexico by region.
const MARKET = { mx_cun: [0.7, 0.3], mx_rm: [0.65, 0.35], mx_yuc: [0.2, 0.8], mx_ver: [0.05, 0.95], cu: [0.15, 0.1] };
export const CROWD_LEVELS = [[25, "Quiet", "#2e9e6b"], [45, "Moderate", "#8bbf3f"], [65, "Busy", "#e3b52a"], [82, "Very busy", "#e0772b"], [101, "Packed", "#c8372d"]];
// Airport day-of-week pattern (Sun..Sat).
const AIRPORT_DOW = [1.08, 0.95, 0.72, 0.75, 1.02, 1.08, 0.85];
const RESORT_DOW = [0.95, 0.85, 0.82, 0.85, 0.95, 1.12, 1.15];

export function crowds(resort, d, { weatherPenalty = 0 } = {}) {
  const [usShare, mxShare] = MARKET[resort.region] || [1, 0];
  const base = monthly(CROWD_BASE[resort.region], d);
  const hols = holidaysOn(d);
  let boost = 0; const reasons = [];
  let travelPeak = false;
  for (const h of hols) {
    if (h.cities && !h.cities.some((c) => resort.city.includes(c))) continue;
    let w = h.us * usShare + h.mx * mxShare;
    // spring break matters most at the classic spring-break beaches
    if (h.name.startsWith("College") && !["fl_ph", "tx_lo", "tx_up", "al_ms", "mx_cun"].includes(resort.region)) w *= 0.5;
    if (w > 0.05) { boost += w; reasons.push(h.name); }
    if (h.travel) travelPeak = true;
  }
  const dow = d.getUTCDay();
  const resortScore = Math.round(clamp((base * RESORT_DOW[dow] + boost * 0.35 - weatherPenalty) * 82, 3, 100));
  const airportScore = Math.round(clamp((base * 0.7 + 0.25) * AIRPORT_DOW[dow] * 70 + (travelPeak ? 18 : 0) + boost * 10, 3, 100));
  const cityScore = Math.round(clamp((base * 0.8 + 0.15) * (dow === 5 || dow === 6 ? 1.1 : 0.95) * 75 + boost * 22, 3, 100));
  const lab = (s) => { const [, l, c] = level(s, CROWD_LEVELS); return { score: s, label: l, color: c }; };
  return {
    resort: lab(resortScore),
    airport: { ...lab(airportScore), tip: travelPeak ? "Holiday travel peak: arrive 2.5+ hrs early for departures" : AIRPORT_DOW[dow] > 1 ? "Busy weekday pattern: arrive 2 hrs early" : "Typical: arrive 90 min early (domestic)" },
    city: lab(cityScore),
    drivers: reasons,
  };
}

// ---------- tropical & safety ----------
// Climatological chance (%) a tropical storm/hurricane affects the area
// within about +/-3 days of a date. Peak around Sep 10.
export function tropicalRisk(resort, d) {
  const md = d.getUTCMonth() * 31 + d.getUTCDate();
  if (md < 5 * 31 + 1 || md > 10 * 31 + 30) return { pct: 0, label: "Outside hurricane season" };
  const x = (doy(d) - 253) / 32;
  const regional = { fl_ph: 1.1, al_ms: 1.1, la: 1.2, tx_up: 1.05, tx_lo: 0.9, fl_sw: 0.9, fl_tb: 0.8, fl_keys: 1.0, mx_cun: 0.9, mx_rm: 0.9, mx_yuc: 0.7, mx_ver: 0.7, cu: 0.9 }[resort.region] ?? 1;
  const pct = Math.round(Math.exp(-x * x) * 9 * regional * 10) / 10;
  return { pct, label: pct >= 6 ? "Peak hurricane season" : pct >= 2 ? "Active hurricane season" : "Hurricane season (quiet phase)" };
}

export function ripRisk({ waveFt, periodS, windDir, windMph, facing }) {
  if (waveFt == null) return null;
  let s = waveFt * 1.2 + (periodS ? Math.max(0, periodS - 6) * 0.4 : 0);
  if (windDir != null) s += Math.max(0, onshore(facing, windDir)) * (windMph || 0) / 8;
  const label = s >= 4.5 ? "High" : s >= 2.5 ? "Moderate" : "Low";
  const flag = label === "High" ? "Red" : label === "Moderate" ? "Yellow" : "Green";
  return { label, flag, score: Math.round(s * 10) / 10 };
}

export const uvCategory = (uv) => uv == null ? null : uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme";

export function heatIndexF(t, rh) {
  if (t == null || rh == null) return null;
  if (t < 80) return Math.round(0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094));
  const hi = -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
  return Math.round(hi);
}
export const heatCategory = (hi) => hi == null ? null : hi >= 125 ? "Extreme danger" : hi >= 103 ? "Danger" : hi >= 90 ? "Extreme caution" : hi >= 80 ? "Caution" : "Comfortable";

export function safety(resort, d, w = {}) {
  const tropical = tropicalRisk(resort, d);
  const rip = ripRisk({ waveFt: w.waveFt, periodS: w.periodS, windDir: w.windDir, windMph: w.windMph, facing: resort.facing });
  const hi = heatIndexF(w.tmaxF, w.rh);
  const items = [];
  if (rip?.label === "High") items.push("High rip-current risk: swim only near lifeguards");
  if (w.uv >= 8) items.push(`UV ${Math.round(w.uv)}: reapply SPF 30+ every 2 hrs, shade 11am–3pm`);
  if (hi >= 103) items.push(`Heat index ~${hi}°F: limit midday exertion, hydrate`);
  if (w.thunderPct >= 30) items.push("Afternoon thunderstorms likely: leave the beach at first thunder");
  if (tropical.pct >= 4) items.push("Peak hurricane season: buy refundable/insured travel, watch NHC");
  return {
    ripCurrent: rip,
    uv: w.uv != null ? { index: Math.round(w.uv * 10) / 10, category: uvCategory(w.uv) } : null,
    heatIndexF: hi, heat: heatCategory(hi),
    tropical,
    travelAdvisory: SAFETY[resort.region].advisory,
    local: SAFETY[resort.region].notes,
    actions: items,
  };
}

// ---------- climate normals from archive data ----------
// archive: Open-Meteo archive daily block (metric). Returns 366 buckets
// indexed by day-of-year with +/-5 day smoothing across all years.
export function normalsFromArchive(a, marine) {
  const n = a.time.length;
  const buckets = Array.from({ length: 367 }, () => ({ c: 0, tmax: 0, tmin: 0, wet: 0, pr: 0, cloud: 0, cc: 0, wind: 0, rad: 0, rh: 0, rhc: 0, thunder: 0 }));
  for (let i = 0; i < n; i++) {
    const d = parseISO(a.time[i]);
    const k = doy(d);
    if (a.temperature_2m_max[i] == null) continue;
    for (let o = -5; o <= 5; o++) {
      const b = buckets[((k + o - 1 + 366) % 366) + 1];
      b.c++;
      b.tmax += a.temperature_2m_max[i]; b.tmin += a.temperature_2m_min[i];
      const p = a.precipitation_sum[i] ?? 0; b.pr += p; if (p >= 1) b.wet++;
      if (a.cloud_cover_mean?.[i] != null) { b.cloud += a.cloud_cover_mean[i]; b.cc++; }
      b.wind += a.wind_speed_10m_max[i] ?? 0; b.rad += a.shortwave_radiation_sum[i] ?? 0;
      if (a.relative_humidity_2m_mean?.[i] != null) { b.rh += a.relative_humidity_2m_mean[i]; b.rhc++; }
      if ([95, 96, 99].includes(a.weather_code?.[i])) b.thunder++;
    }
  }
  const sst = marine ? marineNormals(marine) : null;
  return buckets.map((b, k) => b.c === 0 ? null : {
    tmaxF: cToF(b.tmax / b.c), tminF: cToF(b.tmin / b.c),
    precipProb: Math.round((b.wet / b.c) * 100), precipIn: Math.round((b.pr / b.c / 25.4) * 100) / 100,
    cloud: b.cc ? Math.round(b.cloud / b.cc) : null,
    windMph: Math.round(b.wind / b.c * 0.621),
    uv: Math.round(Math.min(13, (b.rad / b.c) * 0.42) * 10) / 10,
    rh: b.rhc ? Math.round(b.rh / b.rhc) : null,
    thunderPct: Math.round((b.thunder / b.c) * 100),
    sstF: sst?.[k]?.sst ?? null, waveFt: sst?.[k]?.wave ?? null,
  });
}
function marineNormals(m) {
  const acc = Array.from({ length: 367 }, () => ({ s: 0, sc: 0, w: 0, wc: 0 }));
  for (let i = 0; i < m.time.length; i++) {
    const k = doy(parseISO(m.time[i]));
    for (let o = -7; o <= 7; o++) {
      const b = acc[((k + o - 1 + 366) % 366) + 1];
      if (m.sst?.[i] != null) { b.s += m.sst[i]; b.sc++; }
      if (m.wave?.[i] != null) { b.w += m.wave[i]; b.wc++; }
    }
  }
  return acc.map((b) => ({ sst: b.sc ? cToF(b.s / b.sc) : null, wave: b.wc ? Math.round((b.w / b.wc) * 3.281 * 10) / 10 : null }));
}
export const cToF = (c) => Math.round((c * 9) / 5 + 32);

// Fallback when archive data is unavailable: regional SST table only.
export const fallbackSstF = (resort, d) => cToF(monthly(REGIONS[resort.region].sst, d));

export const WMO = {
  0: ["Clear", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"], 45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"], 61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"], 71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 80: ["Showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  95: ["Thunderstorms", "⛈️"], 96: ["Thunderstorms w/ hail", "⛈️"], 99: ["Severe thunderstorms", "⛈️"],
};
export const describeClimate = (n) => n.thunderPct >= 25 ? ["Typical: sun + p.m. storms", "⛈️"] : n.precipProb >= 45 ? ["Typical: showery", "🌦️"] : n.cloud >= 60 ? ["Typical: mostly cloudy", "☁️"] : n.cloud >= 35 ? ["Typical: partly cloudy", "⛅"] : ["Typical: mostly sunny", "🌤️"];

// ---------- unify one day ----------
// fc: forecast-day record or null; nm: climate normal for that doy or null.
export function buildDay(resort, d, today, { fc = null, marine = null, nm = null } = {}) {
  const daysOut = Math.round((d - today) / DAY);
  const source = fc ? "forecast" : "climate-outlook";
  const w = fc ? {
    summary: WMO[fc.code]?.[0] ?? "—", icon: WMO[fc.code]?.[1] ?? "", tmaxF: fc.tmaxF, tminF: fc.tminF, feelsF: fc.feelsF,
    precipProb: fc.precipProb, precipIn: fc.precipIn, cloud: fc.cloud, uv: fc.uv, windMph: fc.windMph, gustMph: fc.gustMph, windDir: fc.windDir,
    rh: fc.rh, thunderPct: [95, 96, 99].includes(fc.code) ? 60 : 0, sunrise: fc.sunrise, sunset: fc.sunset,
  } : nm ? {
    summary: describeClimate(nm)[0], icon: describeClimate(nm)[1], tmaxF: nm.tmaxF, tminF: nm.tminF, feelsF: null,
    precipProb: nm.precipProb, precipIn: nm.precipIn, cloud: nm.cloud, uv: nm.uv, windMph: nm.windMph, windDir: null, rh: nm.rh, thunderPct: nm.thunderPct,
  } : { summary: "Climate data loading…", icon: "" };
  const ocean = marine ? { source: "forecast", sstF: marine.sstF, waveFt: marine.waveFt, periodS: marine.periodS, waveDir: marine.waveDir, swellFt: marine.swellFt }
    : { source: "climate-outlook", sstF: nm?.sstF ?? fallbackSstF(resort, d), waveFt: nm?.waveFt ?? null, periodS: null };
  const sarg = sargassum(resort, d, { windDir: w.windDir, windMph: w.windMph, daysOut });
  const crowd = crowds(resort, d, { weatherPenalty: (w.precipProb ?? 0) > 70 ? 0.1 : 0 });
  const safe = safety(resort, d, { ...w, waveFt: ocean.waveFt, periodS: ocean.periodS });
  return { date: iso(d), daysOut, source, weather: w, ocean, sargassum: sarg, crowds: crowd, safety: safe, holidays: holidaysOn(d).map((h) => h.name) };
}
