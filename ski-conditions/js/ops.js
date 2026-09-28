// Deeper forecast products and resort-operations tools. Pure functions.
//  - snowfall ranges (P10/P50/P90) and powder-day probability from model spread
//  - snow quality from the snow-to-liquid ratio of each storm
//  - snowmaking windows from wet-bulb temperature
//  - lift wind-hold risk from gusts at each lift's top station
//  - grooming priorities, rain-on-snow alerts, a drafted morning snow report
import { atElevation, slr, SURFACES, MODELS } from "./model.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const localDay = (t) => t.slice(0, 10);

// ---------- uncertainty ----------
// Linear-interpolated quantile of a small sample.
export function quantile(xs, q) {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return s[lo] + (s[hi] - s[lo]) * (p - lo);
}
// Range for one day from the blend plus each model. Global models only, so a
// short-range regional model can't narrow the spread artificially. The spread
// of 4 models understates true uncertainty, so the range is widened by 25 %
// around the median and the probability is shrunk toward 50 %.
export function snowRange(day, threshold = 15) {
  if (!day) return null;
  const vals = Object.entries(day.perModel || {}).filter(([m]) => MODELS[m]).map(([, v]) => v);
  vals.push(day.snow);
  const p50 = quantile(vals, 0.5);
  const widen = (v) => Math.max(0, p50 + (v - p50) * 1.25);
  const hits = vals.filter((v) => v >= threshold).length;
  return { p10: widen(quantile(vals, 0.1)), p50, p90: widen(quantile(vals, 0.9)), chance: Math.round(((hits + 0.5) / (vals.length + 1)) * 100), n: vals.length };
}

// ---------- snow quality ----------
export const QUALITY = [
  [15, "Champagne", "Very light, dry powder"],
  [11.5, "Dry powder", "Classic light powder"],
  [9, "Standard", "Average density"],
  [0, "Heavy / wet", "Dense, wet snow (\"cement\")"],
];
// Snowfall-weighted snow-to-liquid ratio per local day at elevation z.
export function snowQuality(h, z) {
  const out = {};
  for (let i = 0; i < h.time.length; i++) {
    const w = atElevation(h, i, z);
    if (!w || w.snowCm < 0.1) continue;
    const d = (out[localDay(h.time[i])] ||= { snow: 0, ratio: 0 });
    d.snow += w.snowCm; d.ratio += w.snowCm * slr(w.T);
  }
  for (const d of Object.values(out)) {
    const r = d.ratio / d.snow;
    const [, label, desc] = QUALITY.find(([t]) => r >= t);
    Object.assign(d, { slr: +r.toFixed(1), label, desc });
  }
  return out;
}

// ---------- snowmaking ----------
// Stull (2011) wet-bulb temperature from air temperature (°C) and RH (%).
export function wetBulb(T, RH) {
  if (T == null || RH == null) return null;
  return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331)
    + 0.00391838 * RH ** 1.5 * Math.atan(0.023101 * RH) - 4.686035;
}
// Temperature at elevation without precipitation (reuses the lapse logic).
const tempAt = (h, i, z) => atElevation(h, i, z, 0)?.T ?? null;
// Snowmaking nights (17:00 → 09:00 local): hours with wet-bulb ≤ −2.5 °C (marginal)
// and ≤ −6 °C (prime, efficient). RH comes from the model at the grid elevation.
export function snowmakingNights(h, z) {
  const nights = {};
  for (let i = 0; i < h.time.length; i++) {
    const t = h.time[i], hr = +t.slice(11, 13);
    if (hr > 9 && hr < 17) continue;
    const night = hr >= 17 ? localDay(t) : new Date(Date.parse(localDay(t) + "T12:00Z") - 864e5).toISOString().slice(0, 10);
    const T = tempAt(h, i, z), Tw = wetBulb(T, h.relative_humidity_2m?.[i] ?? 70);
    if (Tw == null) continue;
    const n = (nights[night] ||= { date: night, hours: 0, prime: 0, minTw: 99 });
    if (Tw <= -2.5) n.hours++;
    if (Tw <= -6) n.prime++;
    n.minTw = Math.min(n.minTw, Tw);
  }
  return Object.values(nights).filter((n) => n.minTw < 99).map((n) => ({ ...n, minTw: +n.minTw.toFixed(1) }));
}

// ---------- lifts ----------
export const LIFT_TYPES = {
  chair_lift: { label: "Chairlift", limit: 65 }, gondola: { label: "Gondola", limit: 75 }, cable_car: { label: "Tram", limit: 80 },
  mixed_lift: { label: "Chondola", limit: 70 }, drag_lift: { label: "Surface lift", limit: 80 }, "t-bar": { label: "T-bar", limit: 80 },
  "j-bar": { label: "J-bar", limit: 80 }, platter: { label: "Platter", limit: 80 }, rope_tow: { label: "Rope tow", limit: 85 },
};
// OSM aerialways: drawn bottom → top by convention.
export function liftsFromOSM(elements) {
  const out = [];
  for (const e of elements) {
    const type = e.tags?.aerialway;
    if (e.type !== "way" || !e.geometry || !LIFT_TYPES[type]) continue;
    const pts = e.geometry.map((p) => [p.lat, p.lon]);
    out.push({ id: String(e.id), name: e.tags.name || `${LIFT_TYPES[type].label} ${e.id}`, type, line: pts, ends: [pts[0], pts[pts.length - 1]] });
  }
  return out;
}
// Gusts grow with height above the model grid (~25 % per 1000 m) and on exposed tops.
export const gustAt = (gust10, z, refElev) => (gust10 == null ? null : gust10 * (1 + 0.25 * Math.max(0, (z - refElev) / 1000)));
// Wind-hold risk per operating day (08:30–16:00): hours over the lift's limit.
export function windHolds(lift, h) {
  const limit = LIFT_TYPES[lift.type]?.limit ?? 70, out = {};
  for (let i = 0; i < h.time.length; i++) {
    const t = h.time[i], hr = +t.slice(11, 13);
    if (hr < 8 || hr > 15) continue;
    const g = gustAt(h.wind_gusts_10m[i], lift.top ?? h.refElev, h.refElev);
    const d = (out[localDay(t)] ||= { hours: 0, marginal: 0, maxGust: 0 });
    if (g > limit) d.hours++; else if (g > limit * 0.85) d.marginal++;
    d.maxGust = Math.max(d.maxGust, g ?? 0);
  }
  for (const d of Object.values(out)) d.risk = d.hours >= 3 ? "likely" : d.hours >= 1 || d.marginal >= 3 ? "possible" : "low";
  return out;
}

// ---------- grooming & alerts ----------
const BAD = { crust: 3, ice: 4, moguls: 2, wind: 2, hardpack: 2, slush: 1, wet: 1, chopped: 1 };
const TRAFFIC = { novice: 3, easy: 3, intermediate: 2.5, advanced: 1.5, expert: 1, freeride: 0.5, extreme: 0.3 };
// Which runs gain the most from grooming tonight: poor afternoon surface × traffic,
// more urgent if it freezes overnight (it will set up hard).
export function groomingPriorities(sim, date, nextDay, h) {
  const night = h.time.map((t, i) => [t, i]).filter(([t]) => (t.startsWith(date) && +t.slice(11, 13) >= 18) || (t.startsWith(nextDay) && +t.slice(11, 13) <= 6));
  const freeze = night.some(([, i]) => (h.temperature_2m[i] ?? 0) < -1);
  return sim.map((s) => {
    const pm = s.byDay[date]?.pm;
    if (!pm || pm.surface === "closed") return null;
    const bad = BAD[pm.surface] || 0;
    if (!bad) return null;
    const why = SURFACES[pm.surface].label.toLowerCase() + (freeze && ["slush", "wet", "moguls", "chopped"].includes(pm.surface) ? ", refreezing tonight" : "");
    return { run: s.run, surface: pm.surface, why, priority: Math.round(bad * (TRAFFIC[s.run.difficulty] ?? 2) * (freeze ? 1.3 : 1) * 10) / 10 };
  }).filter(Boolean).sort((a, b) => b.priority - a.priority);
}
export function alerts(snow, depthCm) {
  const out = [];
  for (const [d, b] of Object.entries(snow.base)) {
    if (b.rain >= 3 && (depthCm ?? 1) > 0) out.push({ date: d, kind: "rain", text: `Rain on snow at the base (${b.rain.toFixed(0)} mm)` });
    const s = snow.summit[d];
    if (s && s.Tmax > 3 && s.Tmin < -3) out.push({ date: d, kind: "freeze-thaw", text: "Freeze-thaw at the summit: soft afternoons, firm mornings" });
    if (s && s.windMax > 70) out.push({ date: d, kind: "wind", text: `Strong wind (${Math.round(s.windMax)} km/h at 10 m)` });
  }
  return out;
}

// ---------- drafted snow report ----------
// A plain-language report a resort can edit and publish. fmt = { cm, deg, m }.
export function draftReport(r, { date, snow, range, quality, best, holds, making, fmt }) {
  const s24 = snow.summit[date]?.snow ?? 0, b24 = snow.base[date]?.snow ?? 0;
  const lines = [];
  lines.push(s24 >= 1 ? `${fmt.cm(s24)} of new snow forecast at the summit today (${fmt.cm(b24)} at the base)${quality?.label ? `, ${quality.label.toLowerCase()} quality` : ""}.` : "No significant new snow expected today.");
  if (range) lines.push(`Next 3 days: ${fmt.cm(range.p50)} expected at the summit (range ${fmt.cm(range.p10)}–${fmt.cm(range.p90)}).`);
  if (best?.length) lines.push(`Best skiing: ${best.map((b) => `${b.run.name} (${SURFACES[b.st.surface].label.toLowerCase()})`).join(", ")}.`);
  const windy = holds.filter((x) => x.risk !== "low");
  if (windy.length) lines.push(`Wind may affect ${windy.map((x) => x.name).slice(0, 4).join(", ")}${windy.length > 4 ? ` and ${windy.length - 4} more` : ""}.`);
  if (making?.hours) lines.push(`Snowmaking tonight: about ${making.hours} hours of snowmaking temperatures at mid-mountain${making.prime ? ` (${making.prime} prime)` : ""}.`);
  lines.push(`Summit ${fmt.deg(snow.summit[date]?.Tmin)} to ${fmt.deg(snow.summit[date]?.Tmax)}.`);
  return lines.join(" ");
}
