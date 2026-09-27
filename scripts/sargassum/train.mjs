// Trains the week-ahead sargassum model from collected history and scores it
// on held-out recent years against simple baselines.
//
//   SARG_DIR=sarg node scripts/sargassum/train.mjs
//
// Example: for segment s and satellite week t, features come from the 7-day
// composite at t (nearshore + offshore rings by sector) and the mean wind and
// surface current over the following 7 days. Label: is the nearshore signal at
// t+7 above the event threshold (tau)? Writes model.json, climatology.json,
// skill.json into SARG_DIR.

import { readFile, writeFile } from "node:fs/promises";
import { SEGMENTS } from "../../js/sargassum/segments.js";
import { SAT_COLS, FEATURES, features, nearValue, predict } from "../../js/sargassum/features.js";
import { RESORTS } from "../../js/resorts.js";
import { SARG_SEASON, monthly, basinOf } from "../../js/model.js";

const DIR = (process.env.SARG_DIR || "sarg").replace(/\/?$/, "/");
const TEST_YEARS = +(process.env.SARG_TEST_YEARS ?? 2);
const EVENT_Q = +(process.env.SARG_EVENT_QUANTILE ?? 0.8);
const DAY = 864e5;
const doyOf = (d) => Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
const weekOf = (d) => Math.min(52, Math.floor((doyOf(d) - 1) / 7));

async function csv(path) {
  try {
    const [head, ...lines] = (await readFile(DIR + path, "utf8")).trim().split("\n");
    return { head: head.split(","), rows: lines.filter(Boolean).map((l) => l.split(",")) };
  } catch { return null; }
}

// ---------- load ----------
const byId = Object.fromEntries(RESORTS.map((r) => [r.id, r]));
const segs = [];
for (const seg of SEGMENTS) {
  const s = await csv(`sat/${seg.key}.csv`); if (!s || !s.rows.length) continue;
  const d = await csv(`drivers/${seg.key}.csv`);
  const sat = new Map(s.rows.map((r) => [r[0], r.slice(1).map((v) => (v === "" ? null : +v))]));
  const drv = new Map((d?.rows || []).map((r) => [r[0], { windU: +r[1] || 0, windV: +r[2] || 0, curU: r[3] === "" ? null : +r[3], curV: r[4] === "" ? null : +r[4] }]));
  const rs = seg.resorts.map((id) => byId[id]);
  const basins = rs.map((r) => basinOf(r));
  const basin = basins.sort((a, b) => basins.filter((x) => x === b).length - basins.filter((x) => x === a).length)[0];
  segs.push({ ...seg, sat, drv, basin, exposure: rs.reduce((a, r) => a + r.exposure, 0) / rs.length });
}
if (!segs.length) { console.log("no satellite history yet; nothing to train"); process.exit(0); }

// Mean driver vector over [t, t+7).
function meanDrivers(seg, t) {
  const acc = { windU: 0, windV: 0, curU: 0, curV: 0, n: 0, nc: 0 };
  for (let i = 0; i < 7; i++) {
    const v = seg.drv.get(new Date(t.getTime() + i * DAY).toISOString().slice(0, 10)); if (!v) continue;
    acc.windU += v.windU; acc.windV += v.windV; acc.n++;
    if (v.curU != null) { acc.curU += v.curU; acc.curV += v.curV; acc.nc++; }
  }
  return acc.n ? { windU: acc.windU / acc.n, windV: acc.windV / acc.n, curU: acc.nc ? acc.curU / acc.nc : null, curV: acc.nc ? acc.curV / acc.nc : null } : null;
}

// ---------- examples ----------
const raw = [];
for (const seg of segs) {
  const dates = [...seg.sat.keys()].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));
  for (const d of dates) {
    const t = new Date(d + "T00:00:00Z");
    // Next composite 5–9 days later.
    let next = null;
    for (let k = 5; k <= 9 && !next; k++) { const nd = new Date(t.getTime() + k * DAY).toISOString().slice(0, 10); if (idx.has(nd)) next = nd; }
    if (!next) continue;
    const y = nearValue(seg.sat.get(next)); if (y == null) continue;
    const drv = meanDrivers(seg, t); if (!drv) continue;
    raw.push({ seg, t, year: t.getUTCFullYear(), week: weekOf(t), sat: seg.sat.get(d), drv, y });
  }
}
const years = [...new Set(raw.map((r) => r.year))].sort();
const testYears = new Set(years.slice(-TEST_YEARS));
const train = raw.filter((r) => !testYears.has(r.year)), test = raw.filter((r) => testYears.has(r.year));
if (train.length < 200 || test.length < 50) {
  await writeFile(DIR + "skill.json", JSON.stringify({ status: "insufficient-data", examples: raw.length, years }, null, 1));
  console.log(`only ${raw.length} examples so far (${years.join(", ")}); need more history`); process.exit(0);
}

// Event threshold from the training labels.
const ys = train.map((r) => r.y).sort((a, b) => a - b);
const tau = ys[Math.floor(EVENT_Q * ys.length)];

// Climatology: event rate per segment and week (train years only), smoothed ±2 weeks.
const climCount = new Map();
for (const r of train) {
  const k = r.seg.key, a = climCount.get(k) ?? Array.from({ length: 53 }, () => [0, 0]);
  a[r.week][0] += r.y > tau ? 1 : 0; a[r.week][1]++; climCount.set(k, a);
}
const globalRate = train.filter((r) => r.y > tau).length / train.length;
const climatology = {};
for (const seg of segs) {
  const a = climCount.get(seg.key);
  climatology[seg.key] = Array.from({ length: 53 }, (_, w) => {
    let e = 0, n = 0;
    for (let o = -2; o <= 2; o++) { const c = a?.[(w + o + 53) % 53]; if (c) { e += c[0]; n += c[1]; } }
    return +((e + globalRate * 2) / (n + 2)).toFixed(3); // shrink toward the global rate
  });
}

const build = (r) => ({ x: features(r.sat, r.drv, { facing: r.seg.facing, doy: doyOf(r.t), clim: climatology[r.seg.key][r.week] }), y: r.y > tau ? 1 : 0, r });
const TR = train.map(build), TE = test.map(build);

// ---------- logistic regression (L2, batch gradient descent) ----------
function fit(rows, feats, { l2 = 1e-3, lr = 0.2, iters = 3000 } = {}) {
  const mean = feats.map((k) => rows.reduce((a, r) => a + r.x[k], 0) / rows.length);
  const std = feats.map((k, i) => Math.sqrt(rows.reduce((a, r) => a + (r.x[k] - mean[i]) ** 2, 0) / rows.length) || 1);
  const X = rows.map((r) => feats.map((k, i) => (r.x[k] - mean[i]) / std[i])), Y = rows.map((r) => r.y);
  const w = feats.map(() => 0); let b = Math.log((globalRate + 1e-3) / (1 - globalRate + 1e-3));
  for (let it = 0; it < iters; it++) {
    const g = w.map(() => 0); let gb = 0;
    for (let n = 0; n < X.length; n++) {
      let z = b; for (let i = 0; i < w.length; i++) z += w[i] * X[n][i];
      const e = 1 / (1 + Math.exp(-z)) - Y[n];
      gb += e; for (let i = 0; i < w.length; i++) g[i] += e * X[n][i];
    }
    b -= (lr * gb) / X.length;
    for (let i = 0; i < w.length; i++) w[i] -= lr * (g[i] / X.length + l2 * w[i]);
  }
  return { features: feats, mean, std, weights: w.map((v) => +v.toFixed(5)), bias: +b.toFixed(5) };
}

// ---------- metrics ----------
function auc(ps, ys) {
  const pairs = ps.map((p, i) => [p, ys[i]]).sort((a, b) => a[0] - b[0]);
  let rank = 0, sumPos = 0, nPos = 0;
  for (let i = 0; i < pairs.length; ) {
    let j = i; while (j < pairs.length && pairs[j][0] === pairs[i][0]) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (pairs[k][1]) { sumPos += avg; nPos++; }
    rank = j; i = j;
  }
  const nNeg = pairs.length - nPos;
  return nPos && nNeg ? +((sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)).toFixed(3) : null;
}
const brier = (ps, ys) => +(ps.reduce((a, p, i) => a + (p - ys[i]) ** 2, 0) / ps.length).toFixed(4);
function score(name, ps, rows) {
  const ys = rows.map((r) => r.y);
  return { name, auc: auc(ps, ys), brier: brier(ps, ys) };
}

const model = fit(TR, FEATURES);
const persistence = fit(TR, ["near"]);
const yTE = TE.map((r) => r.y);
const results = [
  score("model", TE.map((r) => predict(model, r.x)), TE),
  score("climatology", TE.map((r) => r.x.clim), TE),
  score("persistence", TE.map((r) => predict(persistence, r.x)), TE),
  // Hand-drawn seasonal curve × exposure used by the site before this model.
  score("legacy-seasonal", TE.map((r) => monthly(SARG_SEASON[r.r.seg.basin] ?? SARG_SEASON.none, r.r.t) * r.r.seg.exposure), TE),
];
const byBasin = {};
for (const b of [...new Set(segs.map((s) => s.basin))]) {
  const rows = TE.filter((r) => r.r.seg.basin === b); if (rows.length < 30) continue;
  byBasin[b] = { n: rows.length, eventRate: +(rows.filter((r) => r.y).length / rows.length).toFixed(3), model: score("model", rows.map((r) => predict(model, r.x)), rows), climatology: score("climatology", rows.map((r) => r.x.clim), rows) };
}
const skill = {
  status: "ok", trainedAt: new Date().toISOString(), tau, eventQuantile: EVENT_Q,
  trainYears: years.filter((y) => !testYears.has(y)), testYears: [...testYears], nTrain: TR.length, nTest: TE.length,
  testEventRate: +(yTE.reduce((a, b) => a + b, 0) / yTE.length).toFixed(3), segments: segs.length,
  labelQuantiles: Object.fromEntries([0.5, 0.8, 0.9, 0.95, 0.99].map((q) => [q, ys[Math.floor(q * ys.length)]])),
  results, byBasin,
  weights: Object.fromEntries(model.features.map((k, i) => [k, model.weights[i]])),
};
await writeFile(DIR + "model.json", JSON.stringify({ ...model, tau, trainedAt: skill.trainedAt, satCols: SAT_COLS.length }));
await writeFile(DIR + "climatology.json", JSON.stringify({ tau, globalRate, weeks: 53, segments: climatology }));
await writeFile(DIR + "skill.json", JSON.stringify(skill, null, 1));
console.log(JSON.stringify({ tau, nTrain: TR.length, nTest: TE.length, results, weights: skill.weights }, null, 1));
