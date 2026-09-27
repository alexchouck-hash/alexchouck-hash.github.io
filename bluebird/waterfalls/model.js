// Waterfall flow model. Flow (0–100) blends the typical flow for the month with
// how wet the last few weeks have been compared with the same weeks in past years.
// Rain-fed falls respond mostly to recent rain; snowmelt, big-river, spring-fed
// and regulated falls follow their season.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const RAIN_WEIGHT = { rain: 0.65, snowmelt: 0.25, river: 0.15, steady: 0.05 };

// Antecedent precipitation index: yesterday counts fully, older rain fades 12 %/day.
export function api(precip, k = 0.88) { let a = 0; for (const p of precip) a = a * k + (p || 0); return a; }
// Wetness ratio (1 = normal) → 0–100 score.
export const wetScore = (ratio) => Math.round(100 * (1 - Math.exp(-0.7 * Math.max(0, ratio))));

export function seasonal(fall, iso) {
  const m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
  const next = fall.months[(m + 1) % 12], cur = fall.months[m];
  return cur + ((next - cur) * (d - 1)) / 30; // ease into next month
}

export const CLASSES = [
  [85, "Roaring", "#1f4fb3"], [65, "Strong", "#2f7fd1"], [40, "Moderate", "#4aa3b8"], [20, "Low", "#b89a4a"], [0, "Trickle", "#9a7b62"],
];
export const flowClass = (v) => { const [, label, color] = CLASSES.find(([t]) => v >= t); return { label, color }; };

// cur.precip: daily rain for the last N days up to today (oldest first); normals: same-length arrays from past years
// fc: forecast days { date[], precip[], tmax[], tmin[], cloud[] } starting today
export function flowNow(fall, today, cur, normals, tmaxRecent = []) {
  const now = api(cur);
  const norm = normals.length ? normals.map((p) => api(p)).reduce((a, b) => a + b, 0) / normals.length : null;
  const ratio = norm && norm > 1 ? now / norm : 1;
  const w = RAIN_WEIGHT[fall.regime] ?? 0.3;
  const flow = Math.round(clamp(w * wetScore(ratio) + (1 - w) * seasonal(fall, today), 0, 100));
  const frozen = tmaxRecent.length >= 5 && tmaxRecent.slice(-5).every((t) => t != null && t < -3);
  return { flow, ratio: +ratio.toFixed(2), api: now, norm, frozen };
}

// Flow and visit score for each forecast day: rain ahead feeds the API forward.
export function outlook(fall, now, normApi, fc) {
  let a = now.api;
  const w = RAIN_WEIGHT[fall.regime] ?? 0.3;
  return fc.date.map((d, i) => {
    a = a * 0.88 + (fc.precip[i] || 0);
    const ratio = normApi && normApi > 1 ? a / normApi : 1;
    const flow = Math.round(clamp(w * wetScore(ratio) + (1 - w) * seasonal(fall, d), 0, 100));
    const frozen = fc.tmax[i] != null && fc.tmax[i] < -3 && now.frozen;
    // Visiting: more water is better, but hiking in heavy rain isn't.
    const wet = clamp((fc.precip[i] || 0) * 4, 0, 35);
    const sun = 100 - (fc.cloud[i] ?? 50);
    const score = Math.round(clamp(flow * 0.75 + (frozen ? 20 : 0) + sun * 0.15 + 10 - wet, 0, 100));
    return { date: d, flow, score, frozen, rain: fc.precip[i], tmax: fc.tmax[i], rainbow: flow >= 60 && sun >= 60 };
  });
}
