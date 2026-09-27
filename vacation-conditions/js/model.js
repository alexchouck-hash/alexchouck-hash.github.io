// Models for ski, fall colors, hiking (bugs), theme parks/cities (crowds) and
// travel costs. Pure functions shared with the beach site's utilities.

import { monthly, holidaysOn, iso, DAY, level, WMO, heatIndexF } from "../../js/model.js";

// Activity registry. To add a vacation type: add an entry here (label, icon,
// metric weights), give destinations that type in a data file, and compute
// any new metric in scoreParts() below. See vacation-conditions/README.md.
export const ACTIVITIES = {
  ski: { label: "Skiing & snowboarding", icon: "⛷️", weights: { snow: 0.35, skitemp: 0.15, rain: 0.05, crowds: 0.25, cost: 0.2 }, critical: ["snow"] },
  fall: { label: "Fall colors", icon: "🍁", weights: { color: 0.4, temperature: 0.1, rain: 0.15, crowds: 0.15, cost: 0.2 }, critical: ["color"] },
  hike: { label: "Hiking & national parks", icon: "🥾", weights: { temperature: 0.2, rain: 0.15, bugs: 0.2, trailsnow: 0.1, heat: 0.05, crowds: 0.15, cost: 0.15 }, critical: ["temperature", "bugs"] },
  park: { label: "Theme parks", icon: "🎢", weights: { crowds: 0.45, temperature: 0.1, rain: 0.1, heat: 0.1, cost: 0.25 }, critical: [] },
  city: { label: "Cities & events", icon: "🏙️", weights: { crowds: 0.3, temperature: 0.2, rain: 0.15, heat: 0.05, cost: 0.3 }, critical: [] },
  attraction: { label: "Attractions & landmarks", icon: "🏛️", weights: { crowds: 0.4, temperature: 0.15, rain: 0.15, heat: 0.05, cost: 0.25 }, critical: [] },
};
export const SCORE_LEVELS = [[40, "Poor", "#c8372d"], [55, "Fair", "#e0772b"], [70, "Good", "#e3b52a"], [85, "Very good", "#8bbf3f"], [101, "Excellent", "#2e9e6b"]];
export const CROWD_LEVELS = [[25, "Quiet", "#2e9e6b"], [45, "Moderate", "#8bbf3f"], [65, "Busy", "#e3b52a"], [82, "Very busy", "#e0772b"], [101, "Packed", "#c8372d"]];
export const COST_LEVELS = [[0.85, "Low", "#2e9e6b"], [0.97, "Below avg", "#8bbf3f"], [1.08, "Average", "#e3b52a"], [1.3, "High", "#e0772b"], [99, "Peak", "#c8372d"]];

// Crowd-driven activities (show the crowd card, park-style temperature band).
export const CROWD_TYPES = ["park", "city", "attraction"];
const s100 = (x) => Math.round(Math.max(1, Math.min(100, x)));
const band = (v, lo, hi, slope) => (v == null ? null : s100(100 - Math.max(0, lo - v, v - hi) * slope));
const lab = (v, levels) => { const [, l, c] = level(v, levels); return { label: l, color: c }; };

// "MM-DD" -> Date in the given year (noon UTC).
const md = (s, y) => new Date(Date.UTC(y, +s.slice(0, 2) - 1, +s.slice(3, 5), 12));
// Is d inside a MM-DD window (which may wrap past New Year)? Returns days since start or -1.
function inWindow(d, start, end) {
  const y = d.getUTCFullYear();
  for (const yy of [y - 1, y]) {
    const a = md(start, yy); let b = md(end, yy);
    if (b < a) b = md(end, yy + 1);
    if (d >= a && d <= b) return Math.round((d - a) / DAY);
  }
  return -1;
}
function eventsOn(dest, d) {
  return (dest.events || []).filter((e) => inWindow(d, e.start, e.end) >= 0);
}

// ---------- weather: forecast day or typical month ----------
export function weatherFor(dest, d, fc) {
  if (fc) return { source: "forecast", ...fc, summary: WMO[fc.code]?.[0] ?? "—", icon: WMO[fc.code]?.[1] ?? "" };
  const c = dest.climate || {};
  const m = (k) => (c[k] ? Math.round(monthly(c[k], d)) : null);
  const snowIn = c.snowIn ? Math.round((monthly(c.snowIn, d) / 30) * 10) / 10 : 0;
  const p = m("precipPct");
  return { source: "typical", tmaxF: m("tmaxF"), tminF: m("tminF"), precipProb: p, snowIn, cloud: null, windMph: null,
    summary: p == null ? "—" : `Typical: ${p >= 50 ? "unsettled" : p >= 30 ? "mixed" : "mostly dry"}`, icon: p >= 50 ? "🌦️" : p >= 30 ? "⛅" : "🌤️" };
}

// ---------- crowds ----------
const DOW_DEFAULT = [1.1, 0.9, 0.85, 0.85, 0.95, 1.15, 1.2];
export function crowdFor(dest, d) {
  const base = dest.crowd ? monthly(dest.crowd, d) : 0.5;
  const dow = (dest.dow || DOW_DEFAULT)[d.getUTCDay()];
  const hol = holidaysOn(d).filter((h) => h.us > 0.3 && !h.cities);
  const ev = eventsOn(dest, d);
  const bump = hol.reduce((a, h) => a + h.us * 0.3, 0) + ev.reduce((a, e) => a + (e.crowd || 0), 0);
  // A month with zero demand in the table means the place is closed for the season.
  const closed = !!dest.crowd && dest.crowd[d.getUTCMonth()] === 0;
  // Very low table values mean weekends-only / limited seasonal operations.
  const limited = !closed && !!dest.crowd && dest.crowd[d.getUTCMonth()] < 0.15;
  const score = closed ? 1 : s100((base * dow + bump) * 85);
  return { closed, limited, score, level: Math.max(1, Math.min(10, Math.round(score / 10))), ...lab(score, CROWD_LEVELS), drivers: [...hol.map((h) => h.name), ...ev.map((e) => e.name)] };
}

// ---------- travel costs (relative to the destination's annual average) ----------
const FLIGHT_DOW = [1.1, 0.97, 0.9, 0.9, 1.0, 1.1, 0.96];
const HOTEL_DOW = [0.95, 0.92, 0.92, 0.95, 1.02, 1.15, 1.15];
export function costFor(dest, d) {
  const hol = holidaysOn(d).filter((h) => !h.cities);
  const travelPeak = hol.some((h) => h.travel);
  const ev = eventsOn(dest, d).reduce((a, e) => a + Math.max(0, e.crowd || 0), 0);
  const flight = Math.round((dest.flight ? monthly(dest.flight, d) : 1) * FLIGHT_DOW[d.getUTCDay()] * (travelPeak ? 1.2 : 1) * 100) / 100;
  const hotel = Math.round((dest.hotel ? monthly(dest.hotel, d) : 1) * HOTEL_DOW[d.getUTCDay()] * (1 + ev * 0.5 + (travelPeak ? 0.12 : 0)) * 100) / 100;
  const combined = Math.round((flight * 0.45 + hotel * 0.55) * 100) / 100;
  return {
    flight: { index: flight, pct: Math.round((flight - 1) * 100), ...lab(flight, COST_LEVELS) },
    hotel: { index: hotel, pct: Math.round((hotel - 1) * 100), ...lab(hotel, COST_LEVELS) },
    combined: { index: combined, pct: Math.round((combined - 1) * 100), ...lab(combined, COST_LEVELS) },
    tip: FLIGHT_DOW[d.getUTCDay()] < 0.95 ? "Tue/Wed departures are usually cheapest" : "Flying Tue or Wed often saves 5–10%",
  };
}

// ---------- ski ----------
export function skiFor(dest, d, w, live) {
  const s = dest.ski; if (!s) return null;
  const since = inWindow(d, s.open, s.close);
  const open = since >= 0;
  // Typical base depth: builds over the season, peaks ~60% through, then settles.
  let len = Math.round((md(s.close, 2001) - md(s.open, 2000)) / DAY); if (len > 365) len -= 365;
  const t = open ? since / len : 0;
  const typicalBase = open ? Math.round((s.avgSnowIn || 250) * 0.28 * Math.min(1, t / 0.6) * (t > 0.6 ? 1 - (t - 0.6) * 0.6 : 1)) : 0;
  const newSnow = w.snowIn ?? 0;
  return {
    open, typicalBaseIn: typicalBase, newSnowIn: Math.round(newSnow * 10) / 10,
    liveDepthIn: live?.snowDepthIn ?? null,
    status: !open ? "Closed (outside typical season)" : t < 0.1 ? "Early season" : t > 0.85 ? "Spring skiing" : "Mid-season",
  };
}

// ---------- fall colors ----------
export function fallFor(dest, d) {
  const f = dest.fall; if (!f) return null;
  const y = d.getUTCFullYear();
  const peak = md(f.peak, y), spread = f.spreadDays || 10;
  const off = Math.round((d - peak) / DAY);
  const color = Math.round(100 * Math.exp(-((off / (spread * 1.3)) ** 2)));
  const status = off < -spread * 2.5 ? "Green" : off < -spread ? "Turning" : off <= spread ? (Math.abs(off) <= spread / 2 ? "Peak" : "Near peak") : off <= spread * 2.5 ? "Past peak" : "Bare / off season";
  return { color, status, peakDate: iso(peak), daysFromPeak: off, trees: f.trees };
}

// ---------- bugs (hiking) ----------
const BUGS = { mosquito: "Mosquitoes", blackfly: "Black flies", tick: "Ticks", biting_fly: "Biting flies & no-see-ums" };
export function bugsFor(dest, d, w) {
  const b = dest.bugs; if (!b) return null;
  // Cold days suppress flying insects; ticks stay active above ~40°F.
  const t = w.tmaxF ?? 70;
  const fly = t < 50 ? 0.15 : t < 60 ? 0.55 : 1;
  const tick = t < 40 ? 0.1 : 1;
  const each = Object.fromEntries(Object.keys(BUGS).filter((k) => b[k]).map((k) => {
    const v = Math.round(monthly(b[k], d) * (k === "tick" ? tick : fly) * 100);
    return [k, { name: BUGS[k], index: v, label: v >= 70 ? "Severe" : v >= 45 ? "High" : v >= 20 ? "Moderate" : "Low" }];
  }));
  const worst = Math.max(0, ...Object.values(each).map((x) => x.index));
  return { index: worst, label: worst >= 70 ? "Severe" : worst >= 45 ? "High" : worst >= 20 ? "Moderate" : "Low", each };
}

// ---------- sky: daylight and moon (pure astronomy, every destination) ----------
export function daylight(lat, d) {
  const n = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + n)) / 365) * (Math.PI / 180);
  const x = -Math.tan((lat * Math.PI) / 180) * Math.tan(decl);
  const hours = x <= -1 ? 24 : x >= 1 ? 0 : (2 * Math.acos(x) * 180) / Math.PI / 15;
  return Math.round(hours * 10) / 10;
}
export function moon(d) {
  const synodic = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const age = ((((d - ref) / DAY) % synodic) + synodic) % synodic;
  const illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100);
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return { illumination: illum, phase: names[Math.round((age / synodic) * 8) % 8], darkSky: illum < 25 };
}

// ---------- favorability per activity ----------
export const METRICS = {
  snow: "Snow", skitemp: "Ski temperature", color: "Fall color", temperature: "Temperature", rain: "Rain/snow chance",
  bugs: "Bugs", trailsnow: "Trail snow", heat: "Heat", crowds: "Crowds", cost: "Travel cost",
};
function score(activity, rec) {
  const w = rec.weather, parts = {};
  const need = ACTIVITIES[activity].weights;
  if (need.snow) parts.snow = !rec.ski?.open ? 1 : s100(35 + Math.min(45, (rec.ski.liveDepthIn ?? rec.ski.typicalBaseIn) * 0.6) + Math.min(20, rec.ski.newSnowIn * 6));
  if (need.skitemp) parts.skitemp = band(w.tmaxF, 22, 38, 3);
  if (need.color) parts.color = rec.fall ? s100(rec.fall.color) : null;
  if (need.temperature) parts.temperature = rec.waterPark ? band(w.tmaxF, 82, 95, 6) : CROWD_TYPES.includes(activity) ? band(w.tmaxF, 65, 84, 3) : activity === "fall" ? band(w.tmaxF, 52, 72, 3) : band(w.tmaxF, 55, 78, 3);
  if (need.rain) parts.rain = w.precipProb == null ? null : s100(100 - w.precipProb * (activity === "ski" ? 0.3 : 0.9));
  if (need.bugs) parts.bugs = rec.bugs ? s100(100 - rec.bugs.index) : null;
  // Snow on trails: typical monthly snowfall at the trailhead plus any forecast snow.
  if (need.trailsnow) parts.trailsnow = s100(100 - Math.min(90, rec.monthSnowIn * 4) - (w.source === "forecast" ? (w.snowIn || 0) * 30 : 0));
  if (need.heat) { const hi = heatIndexF(w.tmaxF, 60); parts.heat = hi == null ? null : s100(100 - Math.max(0, hi - 88) * 5); }
  parts.crowds = s100(100 - rec.crowds.score * 0.9);
  parts.cost = s100(100 - (rec.cost.combined.index - 0.8) * 110);
  let tot = 0, wt = 0;
  for (const [k, v] of Object.entries(parts)) if (v != null && need[k]) { tot += v * need[k]; wt += need[k]; }
  const drag = ACTIVITIES[activity].critical.reduce((a, k) => a + (parts[k] != null && need[k] ? Math.max(0, 35 - parts[k]) * 0.4 : 0), 0);
  const closed = CROWD_TYPES.includes(activity) && rec.crowds.closed;
  let total = closed ? 1 : s100(tot / (wt || 1) - drag);
  // Water parks are only worth it on hot days.
  if (rec.waterPark && parts.temperature != null) total = Math.min(total, parts.temperature);
  if (closed) return { activity, total, label: "Closed", color: "#8a8f94", parts: {} };
  if (CROWD_TYPES.includes(activity) && rec.crowds.limited && total > 50) return { activity, total: 50, label: "Limited", color: "#e0772b", parts: Object.fromEntries(Object.entries(parts).filter(([k]) => need[k])) };
  return { activity, total, ...lab(total, SCORE_LEVELS), parts: Object.fromEntries(Object.entries(parts).filter(([k]) => need[k])) };
}

export function mainActivity(dest, pref) {
  return pref && dest.types.includes(pref) ? pref : dest.types[0];
}

// Everything for one destination on one date.
export function buildDay(dest, d, today, { fc = null, live = null, activity } = {}) {
  const act = mainActivity(dest, activity);
  const weather = weatherFor(dest, d, fc);
  const rec = {
    date: iso(d), daysOut: Math.round((d - today) / DAY), activity: act, weather,
    crowds: crowdFor(dest, d), cost: costFor(dest, d),
    ski: dest.ski ? skiFor(dest, d, weather, live) : null,
    fall: dest.fall ? fallFor(dest, d) : null,
    bugs: dest.bugs ? bugsFor(dest, d, weather) : null,
    events: eventsOn(dest, d).map((e) => e.name),
    daylightHours: daylight(dest.lat, d), moon: moon(d), waterPark: dest.park?.kind === "water",
    monthSnowIn: dest.climate?.snowIn ? Math.round(monthly(dest.climate.snowIn, d)) : 0,
  };
  rec.score = score(act, rec);
  rec.scores = Object.fromEntries(dest.types.map((t) => [t, t === act ? rec.score : score(t, rec)]));
  return rec;
}
