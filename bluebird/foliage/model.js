// Fall color model. Pure functions, used in the browser and in tests.
//
// Each spot has a climatological peak date. This year's peak moves with:
//  - temperature anomaly: a warmer autumn delays color ~2.5 days per °C;
//  - early hard frost (≤ -2 °C) since Sep 1: brings it forward ~3 days;
//  - drought (< 50 % of normal rain since Aug 1): ~3 days earlier and duller (worse the drier).
// Brilliance (0–100) rewards sunny, cool days with cool nights over the last
// three weeks (they build red anthocyanins) and penalizes drought and warm nights.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const doyOf = (iso) => Math.round((Date.parse(iso + "T12:00Z") - Date.parse(iso.slice(0, 4) + "-01-01T12:00Z")) / 864e5) + 1;
export const fromDoy = (year, n) => new Date(Date.UTC(year, 0, n, 12)).toISOString().slice(0, 10);

// Share of trees in full color vs days from peak (negative = before).
export function colorPct(d) {
  if (d <= 0) return Math.round(100 * Math.exp(-((d / 13) ** 2)));
  return Math.round(100 * Math.exp(-((d / 8) ** 2)));
}
export function stage(d) {
  if (d < -21) return { label: "Mostly green", color: "#5c8a3a" };
  if (d < -7) return { label: "Turning", color: "#b5a02a" };
  if (d < -2) return { label: "Near peak", color: "#e08a1e" };
  if (d <= 4) return { label: "Peak color", color: "#d4481f" };
  if (d <= 10) return { label: "Past peak", color: "#9a5a33" };
  return { label: "Leaves down", color: "#7b6f66" };
}

// this: { date[], tmean[], tmin[], tmax[], precip[] } for Aug 1 → today+15 (forecast included)
// past: same fields for the same calendar window in previous years (any number of years)
export function predict(spot, today, cur, past) {
  const year = +today.slice(0, 4);
  const basePeak = doyOf(`${year}-${spot.peak}`);
  const md = (d) => d.slice(5);
  // Window for the anomaly: Sep 1 (or 45 days ago) through 10 days ahead.
  const from = today.slice(5) < "09-01" ? md(fromDoy(year, doyOf(today) - 30)) : md(fromDoy(year, Math.max(doyOf(`${year}-09-01`), doyOf(today) - 45)));
  const to = md(fromDoy(year, doyOf(today) + 10));
  const inWin = (d) => md(d) >= from && md(d) <= to;
  const cm = mean(cur.date.map((d, i) => (inWin(d) ? cur.tmean[i] : null)).filter((x) => x != null));
  const pm = mean(past.date.map((d, i) => (inWin(d) ? past.tmean[i] : null)).filter((x) => x != null));
  const anomaly = cm != null && pm != null ? cm - pm : 0;

  const upTo = (d) => d <= fromDoy(year, doyOf(today) + 7);
  const frost = cur.date.some((d, i) => md(d) >= "09-01" && upTo(d) && cur.tmin[i] != null && cur.tmin[i] <= -2);
  const sumRain = (s, lim) => s.date.reduce((a, d, i) => a + (md(d) >= "08-01" && md(d) <= lim && s.precip[i] != null ? s.precip[i] : 0), 0);
  const years = new Set(past.date.map((d) => d.slice(0, 4))).size || 1;
  const rainNow = sumRain(cur, today.slice(5)), rainNormal = sumRain(past, today.slice(5)) / years;
  const rainRatio = rainNormal > 20 ? rainNow / rainNormal : 1;
  const drought = rainRatio < 0.5;

  let shift = clamp(2.5 * anomaly, -12, 12);
  if (frost) shift -= 3;
  if (drought) shift -= 3;
  const peakDoy = Math.round(basePeak + shift);

  // Brilliance from the last 21 days (observed + near forecast).
  const recent = cur.date.map((d, i) => i).filter((i) => { const n = doyOf(cur.date[i]); return n > doyOf(today) - 21 && n <= doyOf(today) + 3; });
  const crisp = recent.filter((i) => cur.tmax[i] >= 10 && cur.tmax[i] <= 22 && cur.tmin[i] >= -1 && cur.tmin[i] <= 9 && (cur.precip[i] ?? 0) < 2).length;
  const warmNights = recent.filter((i) => cur.tmin[i] > 13).length;
  // Moderate dryness with sun helps; real drought (under half of normal rain) stresses trees and dulls color.
  const droughtPenalty = drought ? 10 + (0.5 - rainRatio) * 80 : 0;
  const brilliance = Math.round(clamp(60 + Math.min(25, 2 * crisp) - 1.5 * warmNights - droughtPenalty - (rainRatio > 1.8 ? 8 : 0), 10, 100));

  return { basePeak, peakDoy, peak: fromDoy(year, peakDoy), shift: Math.round(shift), anomaly: +anomaly.toFixed(1), frost, drought, rainRatio: +rainRatio.toFixed(2), brilliance, daysToPeak: peakDoy - doyOf(today) };
}

// Day-by-day outing score for the forecast days: color × weather.
// Strong gusts strip leaves, so they also cut the color for the days after.
export function bestDays(pred, today, fc) {
  let stripped = 0;
  return fc.date.map((d, i) => {
    const dd = doyOf(d) - pred.peakDoy;
    if (d < today) return null;
    const gust = fc.gust[i] ?? 0;
    if (gust > 60 && dd > -5) stripped += (gust - 60) / 2;
    const color = Math.max(0, colorPct(dd) - stripped);
    const sun = 100 - (fc.cloud[i] ?? 50);
    const wet = clamp((fc.precip[i] ?? 0) * 12 + (fc.pop[i] ?? 0) * 0.3, 0, 60);
    const weather = clamp(0.5 * sun + 50 - wet - Math.max(0, gust - 40) * 0.5, 0, 100);
    const score = Math.round(color * (0.55 + 0.45 * weather / 100) * (0.7 + 0.3 * pred.brilliance / 100));
    return { date: d, color: Math.round(color), weather: Math.round(weather), score, tmax: fc.tmax[i], precip: fc.precip[i], gust };
  }).filter(Boolean);
}
