// Snow model: downscales a blended multi-model forecast to every run and
// simulates the snow surface hour by hour. Pure functions (browser + Node).
//
// Per run segment we account for:
//  - elevation: temperature via a lapse rate fitted to the freezing level,
//    rain/snow split, orographic precipitation boost, snow-to-liquid ratio;
//  - aspect + slope: solar heating from the real sun position (melt, crusts, corn);
//  - wind: loading on lee aspects, scouring on windward ones (strongest above treeline);
//  - people: overnight grooming and daytime skier traffic (tracks, moguls);
//  - snowpack: depth, settling, melt, melt-freeze crusts, rain crusts.

const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = (a) => { const v = a.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

export const MODELS = { ecmwf_ifs025: "ECMWF", gfs_seamless: "GFS", icon_seamless: "ICON", gem_seamless: "GEM" };
// High-resolution regional models, requested only where they cover the resort.
// [latMin, latMax, lonMin, lonMax]. They resolve valleys and ridges far better
// than the ~10-25 km global models, so they get double weight where present.
export const REGIONAL = {
  ncep_hrrr_conus: { label: "HRRR 3 km", box: [21, 53, -134, -60] },
  gem_hrdps_continental: { label: "HRDPS 2.5 km", box: [37, 70, -152, -45] },
  meteofrance_arome_france_hd: { label: "AROME 1.5 km", box: [37.5, 55.4, -12, 16] },
  icon_d2: { label: "ICON-D2 2 km", box: [43.2, 58.1, -3.9, 20.3] },
  jma_msm: { label: "JMA MSM 5 km", box: [22.4, 47.6, 120, 150] },
};
export const MODEL_LABEL = { ...MODELS, ...Object.fromEntries(Object.entries(REGIONAL).map(([k, v]) => [k, v.label])) };
export const regionalFor = (r) => Object.keys(REGIONAL).filter((k) => { const [a, b, c, d] = REGIONAL[k].box; return r.lat >= a && r.lat <= b && r.lon >= c && r.lon <= d; });
export const HOURLY_VARS = ["temperature_2m", "precipitation", "freezing_level_height", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "shortwave_radiation", "cloud_cover", "snow_depth", "relative_humidity_2m"];

// ---------- multi-model blend ----------
// Open-Meteo returns each variable once per model, suffixed with the model name.
// Regional models (if any) arrive in a second response on the same time axis.
// Skill weights from SNOTEL verification (see scripts/verify.mjs `skill`).
// Uses a resort's own station scores when there are enough, else all stations.
// Weight ∝ 1 / (MAE + 1 cm), normalised to average 1, clamped to 0.4–2.5.
export const SKILL_MIN = { resort: 10, global: 30 };
export function skillWeights(skill, resortId) {
  if (!skill) return { weights: {}, source: null };
  const mine = skill.byResort?.[resortId] || {};
  const scored = {};
  let source = null;
  for (const [m, g] of Object.entries(skill.global || {})) {
    if (mine[m]?.n >= SKILL_MIN.resort) { scored[m] = mine[m]; source = source || "resort"; }
    else if (g.n >= SKILL_MIN.global) { scored[m] = g; source = source === "resort" ? "mixed" : source || "global"; }
  }
  const ms = Object.keys(scored);
  if (ms.length < 2) return { weights: {}, source: null };
  const raw = Object.fromEntries(ms.map((m) => [m, 1 / (scored[m].mae + 1)]));
  const avg = ms.reduce((a, m) => a + raw[m], 0) / ms.length;
  return { weights: Object.fromEntries(ms.map((m) => [m, +clamp(raw[m] / avg, 0.4, 2.5).toFixed(2)])), source, n: Math.min(...ms.map((m) => scored[m].n)) };
}

// Per-resort snowfall bias correction from verification (1 = none).
export const biasFactor = (correction, id) => correction?.[id]?.factor ?? 1;

// weights: optional per-model weights (from skillWeights); others use the defaults.
// factor: precipitation multiplier from the resort's verified bias (applied to
// the blend and to each model, so ranges stay consistent).
export function blend(j, regional, weights = {}, factor = 1) {
  const h = { ...j.hourly }, n = h.time.length;
  if (regional?.hourly?.time?.length === n) for (const [k, v] of Object.entries(regional.hourly)) if (k !== "time") h[k] = v;
  const all = [...Object.keys(MODELS), ...Object.keys(REGIONAL)];
  const models = all.filter((m) => h[`temperature_2m_${m}`]?.some((v) => v != null));
  const weight = (m) => weights[m] ?? (REGIONAL[m] ? 2 : 1);
  const series = (v) => Array.from({ length: n }, (_, i) => {
    let s = 0, w = 0;
    for (const m of models) { const x = h[`${v}_${m}`]?.[i]; if (x == null || Number.isNaN(x)) continue; s += x * weight(m); w += weight(m); }
    return w ? s / w : null;
  });
  const out = { time: h.time, utcOffset: j.utc_offset_seconds || 0, refElev: j.elevation, models, weights: Object.fromEntries(models.map((m) => [m, weight(m)])) };
  for (const v of HOURLY_VARS) out[v] = series(v);
  // Wind direction must be averaged as a vector.
  out.wind_direction_10m = h.time.map((_, i) => {
    let x = 0, y = 0, k = 0;
    for (const m of models) { const d = h[`wind_direction_10m_${m}`]?.[i], s = h[`wind_speed_10m_${m}`]?.[i] ?? 1; if (d == null) continue; x += s * Math.sin(d * RAD); y += s * Math.cos(d * RAD); k++; }
    return k ? (Math.atan2(x, y) / RAD + 360) % 360 : null;
  });
  // Per-model liquid precip so we can show spread (confidence).
  const scale = (a) => (factor === 1 || !a ? a : a.map((v) => (v == null ? v : v * factor)));
  out.precipitation = scale(out.precipitation);
  out.perModel = Object.fromEntries(models.map((m) => [m, { P: scale(h[`precipitation_${m}`]), T: h[`temperature_2m_${m}`], FL: h[`freezing_level_height_${m}`] }]));
  out.correction = factor;
  return out;
}

// ---------- physics helpers ----------
// Lapse rate (°C per m, negative) fitted to the freezing level when it's sane.
export function lapse(T, FL, refElev) {
  if (T == null || FL == null || Math.abs(FL - refElev) < 200) return -0.0065;
  const g = -T / (FL - refElev);
  return g < -0.0095 || g > -0.003 ? -0.0065 : g;
}
export const snowFraction = (T) => clamp((2.2 - T) / 2.4, 0, 1); // all snow ≤ -0.2 °C, all rain ≥ 2.2 °C
// Kuchera-style snow-to-liquid ratio: cold air = fluffier snow.
export function slr(T) {
  const k = T + 273.15;
  return clamp(k > 271.16 ? 12 + 2 * (271.16 - k) : 12 + (271.16 - k), 5, 22);
}
// Orographic enhancement relative to the model grid elevation (~4 %/100 m).
export const orographic = (z, refElev) => clamp(1 + 0.04 * (z - refElev) / 100, 0.6, 1.6);

// Weather at elevation z from blended hour i (or a per-model series).
export function atElevation(h, i, z, P = h.precipitation?.[i], T0 = h.temperature_2m?.[i], FL = h.freezing_level_height?.[i]) {
  if (T0 == null) return null;
  const T = T0 + lapse(T0, FL, h.refElev) * (z - h.refElev);
  const p = Math.max(0, P || 0) * orographic(z, h.refElev);
  const f = snowFraction(T);
  return { T, snowCm: (p * f * slr(T)) / 10, rainMm: p * (1 - f), swe: p * f };
}

// Sun position for a UTC time: zenith cosine + azimuth (deg from north).
export function sun(ms, lat, lon) {
  const d = new Date(ms);
  const n = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365) * RAD;
  const st = d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15;
  const H = 15 * (st - 12) * RAD, phi = lat * RAD;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180 + 360) % 360;
  return { cosZ, az };
}
// Shortwave on a tilted slope (W/m²): direct part scaled by incidence, plus diffuse.
export function slopeRadiation(sw, s, slopeDeg, aspectDeg) {
  if (!sw || s.cosZ <= 0.02) return 0;
  const b = slopeDeg * RAD, sinZ = Math.sqrt(1 - s.cosZ ** 2);
  const cosI = s.cosZ * Math.cos(b) + sinZ * Math.sin(b) * Math.cos((s.az - aspectDeg) * RAD);
  const factor = clamp(Math.max(0, cosI) / Math.max(s.cosZ, 0.08), 0, 4);
  return sw * (0.75 * factor + 0.25);
}
// Wind redistribution multiplier for new snow on an aspect.
// Lee slopes (facing downwind) load, windward slopes scour.
export function windFactor(speedKmh, dirFrom, aspect, aboveTreeline) {
  if (speedKmh == null || dirFrom == null || aspect == null) return 1;
  const strength = clamp((speedKmh - 15) / 35, 0, 1) * (aboveTreeline ? 1 : 0.3);
  const lee = Math.cos((aspect - (dirFrom + 180)) * RAD); // +1 = directly lee
  return clamp(1 + 0.6 * strength * lee, 0.3, 1.7);
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// ---------- surface classes ----------
export const SURFACES = {
  closed:   { label: "Not enough snow", score: 0,   color: "#8a8f94" },
  deep:     { label: "Deep powder",     score: 100, color: "#1f6feb" },
  powder:   { label: "Powder",          score: 92,  color: "#3b8cf0" },
  groomedpp:{ label: "Groomed powder",  score: 88,  color: "#2ea0a6" },
  cord:     { label: "Corduroy",        score: 80,  color: "#2fa36b" },
  corn:     { label: "Spring corn",     score: 78,  color: "#9bbf3a" },
  chopped:  { label: "Chopped powder",  score: 74,  color: "#58a6d6" },
  packed:   { label: "Packed / chalky", score: 64,  color: "#8fb573" },
  moguls:   { label: "Tracked / bumps", score: 58,  color: "#c9a93a" },
  wind:     { label: "Wind-affected",   score: 48,  color: "#c98a3a" },
  wet:      { label: "Wet / heavy",     score: 45,  color: "#d07a4a" },
  hardpack: { label: "Firm hardpack",   score: 44,  color: "#b87a5a" },
  slush:    { label: "Slush",           score: 40,  color: "#d9694a" },
  crust:    { label: "Breakable crust", score: 32,  color: "#c4553f" },
  ice:      { label: "Icy",             score: 18,  color: "#a8322d" },
};
const TRAFFIC = { novice: 0.05, easy: 0.06, intermediate: 0.08, advanced: 0.07, expert: 0.05, freeride: 0.03, extreme: 0.02 };
export const DIFFICULTY = {
  novice: { label: "Beginner", sym: "●", color: "#2fa84f" }, easy: { label: "Easy", sym: "●", color: "#2fa84f" },
  intermediate: { label: "Intermediate", sym: "■", color: "#2f6fd1" }, advanced: { label: "Advanced", sym: "◆", color: "#222" },
  expert: { label: "Expert", sym: "◆◆", color: "#222" }, freeride: { label: "Freeride", sym: "◆◆", color: "#d63b2f" }, extreme: { label: "Extreme", sym: "◆◆", color: "#d63b2f" },
};

// ---------- per-run simulation ----------
// run: { top, bottom, aspect, slope, difficulty, groomed }
// Simulates the snow surface at the run's middle and returns per-hour states.
// z: elevation of the segment to simulate (default: middle of the run).
export function simulateRun(run, resort, h, z = (run.top + run.bottom) / 2) {
  const aboveTL = z > resort.treeline - 100;
  const traffic = TRAFFIC[run.difficulty] ?? 0.06;
  const offMs = h.utcOffset * 1000;
  // Seasonal depth: model snow depth at the grid point, raised with elevation.
  const d0 = h.snow_depth.find((v) => v != null);
  const depthKnown = d0 != null;
  const elevBonus = (zz) => clamp((zz - h.refElev) / 100 * 4, -60, 120); // cm per 100 m
  const s = {
    depth: depthKnown ? Math.max(0, d0 * 100 + (d0 > 0.02 ? elevBonus(z) : 0)) : null,
    fresh: 0, freshAge: 99, wet: 0, crust: 0, rainCrust: false, tracked: 0.3, windPack: 0, groomedAt: -99, meltCycles: 0, dryHours: 0,
  };
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = Date.parse(h.time[i] + "Z") - offMs;
    const hour = +h.time[i].slice(11, 13);
    const w = atElevation(h, i, z);
    if (!w) { out.push(null); continue; }
    const wind = h.wind_speed_10m[i] ?? 0, dir = h.wind_direction_10m[i];
    const sp = sun(t, resort.lat, resort.lon);
    const swSlope = slopeRadiation(h.shortwave_radiation[i] ?? 0, sp, run.slope, run.aspect);
    // Snow absorbs little sunlight: fresh snow ~15 %, old/wet snow ~35 %.
    const absorb = s.fresh > 3 ? 0.15 : s.wet ? 0.4 : 0.3;
    const Teff = w.T + (swSlope * absorb) / 40; // ~5 °C of surface warming per 200 W/m² absorbed
    const wf = windFactor(wind, dir, run.aspect, aboveTL);

    // New snow and rain
    const snow = w.snowCm * wf;
    if (snow > 0.05) {
      s.fresh += snow; s.freshAge = 0; s.dryHours = 0;
      if (s.depth != null) s.depth += snow;
      if (snow > 1) { s.crust *= 0.6; s.wet = 0; s.rainCrust = s.crust > 0.3 && s.rainCrust; s.windPack *= 0.7; }
      s.tracked *= clamp(1 - snow / 8, 0, 1);
      if (wind > 30 && aboveTL) s.windPack = clamp(s.windPack + 0.04 * (wind - 30) / 20, 0, 1);
    } else { s.freshAge++; s.dryHours++; }
    if (w.rainMm > 0.3) { s.wet = 1; s.rainCrust = true; s.fresh *= 0.7; if (s.depth != null) s.depth -= w.rainMm * 0.25; }
    // Wind scouring of loose snow on windward faces above treeline
    if (snow < 0.1 && wind > 35 && aboveTL && dir != null && angDiff(run.aspect, dir) < 70) {
      s.fresh *= 0.95; s.windPack = clamp(s.windPack + 0.02, 0, 1);
    }
    // Melt / freeze
    if (Teff > 0) {
      const melt = Teff * 0.08; // cm of depth per degree-hour (~2 cm per °C-day)
      s.wet = clamp(s.wet + 0.15 * Teff, 0, 1);
      s.fresh = Math.max(0, s.fresh * (1 - 0.02 * Teff) - melt * 0.3);
      if (s.depth != null) s.depth -= melt;
      if (s.crust > 0.2 && Teff > 1) s.crust = Math.max(0, s.crust - 0.08 * Teff); // crust softening = corn window
    } else if (s.wet > 0.2 && Teff < -1) {
      s.wet = Math.max(0, s.wet - 0.2);
      if (s.wet <= 0.2) { s.crust = clamp(s.crust + 0.7, 0, 1); s.meltCycles++; s.wet = 0; }
    }
    // Settlement of fresh snow (faster when warm), then it stops counting as "fresh"
    s.fresh *= w.T > -3 ? 0.985 : 0.993;
    if (s.freshAge > 72) s.fresh *= 0.97;
    if (s.dryHours > 24 * 5) s.meltCycles = Math.min(s.meltCycles, 3);
    // Grooming at 04:00 local (skipped when it is pouring snow; groomers go after)
    if (run.groomed && hour === 4) {
      s.groomedAt = i; s.tracked = 0; s.windPack = 0; s.fresh *= 0.5; // cats pack the new snow
      if (s.crust > 0) { s.crust *= 0.25; s.rainCrust = false; }
    }
    // Skier traffic 9–16 h
    if (hour >= 9 && hour <= 16) s.tracked = clamp(s.tracked + traffic * (s.fresh > 5 ? 1.4 : 1), 0, 1);
    if (s.depth != null) s.depth = Math.max(0, s.depth);

    const surface = classify(s, w.T, Teff, i, run.groomed);
    out.push({ i, T: w.T, Teff, snow, rain: w.rainMm, wind, depth: s.depth, fresh: s.fresh, surface, score: scoreOf(surface, wind, aboveTL, w.T) });
  }
  return out;
}

export function classify(s, T, Teff, i, groomed) {
  if (s.depth != null && s.depth < 15) return "closed";
  const groomedToday = groomed && i - s.groomedAt < 16;
  if (s.fresh >= 20 && s.tracked < 0.35) return "deep";
  if (s.fresh >= 6 && s.tracked < 0.45) return groomedToday && s.fresh < 12 ? "groomedpp" : "powder";
  if (s.wet > 0.6 && Teff > 1.5) return T > 3 || s.rainCrust ? "slush" : s.meltCycles >= 2 ? "corn" : "wet";
  if (s.wet > 0.3 && s.meltCycles >= 2 && Teff > 0) return "corn";
  if (groomedToday) return s.fresh >= 2 ? "groomedpp" : s.crust > 0.5 && T < -6 ? "hardpack" : "cord";
  if (s.fresh >= 6) return "chopped";
  if (s.crust > 0.5) return s.rainCrust ? "ice" : "crust";
  if (s.windPack > 0.5) return "wind";
  if (s.tracked > 0.6) return "moguls";
  if (s.dryHours > 24 * 6 && T < -5) return "hardpack";
  return "packed";
}

export function scoreOf(surface, wind, aboveTL, T) {
  let v = SURFACES[surface].score;
  if (!v) return 0;
  if (aboveTL && wind > 50) v -= 15; else if (wind > 40) v -= 6;
  if (T < -20) v -= 8;
  return clamp(Math.round(v), 0, 100);
}

// Top, middle and bottom segments of a run (15 % in from each end).
export function segments(run) {
  const drop = run.top - run.bottom;
  return { top: run.top - 0.15 * drop, mid: (run.top + run.bottom) / 2, bottom: run.bottom + 0.15 * drop };
}
// out.hourly keeps each segment's hour-by-hour states for the run timeline.
export function simulateSegments(run, resort, h) {
  const seg = segments(run), short = run.top - run.bottom <= 120;
  const out = { hourly: {} };
  for (const k of Object.keys(seg)) {
    if (short && k !== "mid") continue;
    out.hourly[k] = simulateRun(run, resort, h, seg[k]);
    out[k] = runDays(out.hourly[k], h);
  }
  if (short) { out.top = out.bottom = out.mid; out.hourly.top = out.hourly.bottom = out.hourly.mid; } // short runs: one segment
  return out;
}

// ---------- climate ----------
// Snow (cm) from a daily precipitation total and mean temperature at elevation.
export const dailySnowFromMean = (P, Tmean) => (P == null || Tmean == null ? 0 : (P * snowFraction(Tmean) * slr(Tmean)) / 10);
// Ski season starts Oct 1 in the north, Apr 1 in the south.
export function seasonStart(lat, iso) {
  const y = +iso.slice(0, 4), md = lat >= 0 ? "10-01" : "04-01";
  return `${iso.slice(5) >= md ? y : y - 1}-${md}`;
}

// ---------- summaries ----------
const localDay = (t) => t.slice(0, 10);
export function days(h) { return [...new Set(h.time.map(localDay))]; }

// Daily snowfall (cm) at an elevation, blended and per model.
export function dailySnow(h, z) {
  const byDay = {};
  for (let i = 0; i < h.time.length; i++) {
    const d = localDay(h.time[i]);
    const b = (byDay[d] ||= { snow: 0, rain: 0, Tmin: 99, Tmax: -99, windMax: 0, perModel: {} });
    const w = atElevation(h, i, z);
    if (w) { b.snow += w.snowCm; b.rain += w.rainMm; b.Tmin = Math.min(b.Tmin, w.T); b.Tmax = Math.max(b.Tmax, w.T); }
    b.windMax = Math.max(b.windMax, h.wind_speed_10m[i] ?? 0);
    for (const [m, s] of Object.entries(h.perModel)) {
      const wm = atElevation(h, i, z, s.P?.[i], s.T?.[i], s.FL?.[i]);
      if (wm) b.perModel[m] = (b.perModel[m] || 0) + wm.snowCm;
    }
  }
  return byDay;
}

// Snow line (m): where precipitation turns from rain to snow, ~ freezing level - 250 m.
export function snowLine(h, i) {
  const FL = h.freezing_level_height[i];
  return FL == null ? null : Math.max(0, Math.round((FL - 250) / 50) * 50);
}

// Per-run daily report: morning (09:30) and afternoon (14:00) states + new snow overnight.
export function runDays(states, h) {
  const out = {};
  (states || []).forEach((s, i) => {
    if (!s) return;
    const d = localDay(h.time[i]), hr = +h.time[i].slice(11, 13);
    const r = (out[d] ||= { snow24: 0 });
    if (hr <= 9) r.snow24 += s.snow;
    if (hr === 9) r.am = s;
    if (hr === 14) r.pm = s;
  });
  return out;
}

// Confidence from model agreement on the next 3 days of summit snowfall.
export function confidence(dayMap, keys) {
  const tot = {};
  for (const k of keys) for (const [m, v] of Object.entries(dayMap[k]?.perModel || {})) if (MODELS[m]) tot[m] = (tot[m] || 0) + v;
  const v = Object.values(tot);
  if (v.length < 2) return { level: "low", spread: null, totals: tot };
  const mx = Math.max(...v), mn = Math.min(...v);
  const spread = mx - mn;
  const level = mx < 3 || spread < 5 + 0.25 * mx ? "high" : spread < 15 + 0.5 * mx ? "medium" : "low";
  return { level, spread, totals: tot };
}

// ---------- run geometry from OpenStreetMap ----------
export function bearing(a, b) {
  const [la1, lo1, la2, lo2] = [a[0] * RAD, a[1] * RAD, b[0] * RAD, b[1] * RAD];
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
export function distM(a, b) {
  const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(q));
}
const lineLen = (pts) => pts.reduce((s, p, k) => (k ? s + distM(pts[k - 1], p) : 0), 0);

// Group OSM ways into named runs. Returns runs with sample points to elevate.
export function runsFromOSM(elements) {
  const groups = new Map();
  for (const e of elements) {
    if (e.type !== "way" || !e.geometry || e.tags?.["piste:type"] !== "downhill") continue;
    const t = e.tags;
    const diff = t["piste:difficulty"] || "intermediate";
    const name = t["piste:name"] || t.name || t["piste:ref"] || t.ref || null;
    const key = name ? `${name}|${diff}` : `#${e.id}`;
    const g = groups.get(key) || { id: name ? key : String(e.id), name, difficulty: diff, ways: [], grooming: t["piste:grooming"] };
    g.ways.push(e.geometry.map((p) => [p.lat, p.lon]));
    groups.set(key, g);
  }
  const runs = [];
  for (const g of groups.values()) {
    const len = g.ways.reduce((s, w) => s + lineLen(w), 0);
    if (len < 150) continue;
    const pts = g.ways.flat();
    const step = Math.max(1, Math.floor((pts.length - 1) / 4));
    const samples = [0, step, 2 * step, 3 * step, pts.length - 1].map((k) => pts[Math.min(k, pts.length - 1)]);
    const groomedTag = g.grooming;
    const groomed = groomedTag ? /classic|skating/.test(groomedTag) : ["novice", "easy", "intermediate"].includes(g.difficulty);
    runs.push({ id: g.id, name: g.name || `Unnamed ${DIFFICULTY[g.difficulty]?.label.toLowerCase() || "run"}`, difficulty: g.difficulty, groomed, ways: g.ways, length: Math.round(len), samples });
  }
  return runs.sort((a, b) => b.length - a.length);
}

// Once sample elevations are known: top, bottom, aspect (downhill bearing), slope.
export function finishRun(run, elevs) {
  let hi = 0, lo = 0;
  elevs.forEach((e, k) => { if (e > elevs[hi]) hi = k; if (e < elevs[lo]) lo = k; });
  const top = elevs[hi], bottom = elevs[lo];
  const horiz = Math.max(50, distM(run.samples[hi], run.samples[lo]));
  return { ...run, top: Math.round(top), bottom: Math.round(bottom), aspect: Math.round(bearing(run.samples[hi], run.samples[lo])), slope: Math.round(clamp(Math.atan((top - bottom) / horiz) / RAD, 3, 45)) };
}

// When OSM has no runs mapped: virtual slopes per elevation band and aspect.
export function virtualRuns(resort) {
  const bands = [["Lower", resort.base, resort.base + (resort.summit - resort.base) / 3], ["Mid", resort.base + (resort.summit - resort.base) / 3, resort.base + (2 * (resort.summit - resort.base)) / 3], ["Upper", resort.base + (2 * (resort.summit - resort.base)) / 3, resort.summit]];
  const asp = [["north", 0], ["east", 90], ["south", 180], ["west", 270]];
  return bands.flatMap(([b, lo, hi]) => asp.map(([a, deg]) => ({ id: `${b}-${a}`, name: `${b} mountain, ${a}-facing`, difficulty: "intermediate", groomed: b !== "Upper", top: Math.round(hi), bottom: Math.round(lo), aspect: deg, slope: 22, virtual: true })));
}
export const compass = (d) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
