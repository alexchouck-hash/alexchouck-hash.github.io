// Feature engineering shared by the trainer (scripts/sargassum/train.mjs) and
// the runtime forecast, so training and prediction see identical inputs.
//
// Satellite vector: for each ring (0–20, 20–60, 60–120 km) and 8 compass
// sectors around a segment: [p90 of the AFAI index, fraction of valid pixels].
// Drivers: mean wind and surface current vectors (m/s, u east / v north,
// direction of travel) over the forecast window.

import { RINGS, SECTORS } from "./segments.js";

export const SAT_COLS = RINGS.flatMap((_, r) => Array.from({ length: SECTORS }, (_, s) => [`r${r}s${s}_p90`, `r${r}s${s}_valid`]).flat());
export const WINDAGE = 0.02;          // sargassum drifts at current + ~2% of wind
const SECONDS_PER_WEEK = 604800;
const RING_MID_KM = RINGS.map(([a, b]) => (a + b) / 2);

export const FEATURES = ["near", "nearValid", "mass1", "mass2", "inflow1", "inflow2", "onshoreWind", "drift", "clim", "seasonSin", "seasonCos"];

const cell = (sat, r, s) => ({ p90: sat[(r * SECTORS + s) * 2], valid: sat[(r * SECTORS + s) * 2 + 1] });

// Largest nearshore signal among sectors with enough clear pixels.
export function nearValue(sat) {
  let best = null;
  for (let s = 0; s < SECTORS; s++) { const c = cell(sat, 0, s); if (c.p90 != null && (c.valid ?? 0) >= 0.15) best = Math.max(best ?? -Infinity, c.p90); }
  return best;
}

export function features(sat, drv, { facing, doy, clim }) {
  const T = [(drv.curU ?? 0) + WINDAGE * (drv.windU ?? 0), (drv.curV ?? 0) + WINDAGE * (drv.windV ?? 0)]; // drift velocity
  const travelKm = (Math.hypot(...T) * SECONDS_PER_WEEK) / 1000;
  const f = { near: nearValue(sat) ?? 0, nearValid: 0, mass1: 0, mass2: 0, inflow1: 0, inflow2: 0 };
  for (let s = 0; s < SECTORS; s++) f.nearValid += (cell(sat, 0, s).valid ?? 0) / SECTORS;
  for (const r of [1, 2]) {
    let mass = 0, inflow = 0, n = 0;
    for (let s = 0; s < SECTORS; s++) {
      const c = cell(sat, r, s); if (c.p90 == null || (c.valid ?? 0) < 0.1) continue;
      n++; mass += c.p90;
      // Unit vector pointing from this sector back toward the coast (center).
      const b = ((s * 360) / SECTORS + 180) * (Math.PI / 180);
      const toward = Math.max(0, T[0] * Math.sin(b) + T[1] * Math.cos(b)) / (Math.hypot(...T) || 1);
      // Share of this ring's distance the mats can cover in a week, capped at 1.
      inflow += c.p90 * toward * Math.min(1, travelKm / RING_MID_KM[r]);
    }
    f[`mass${r}`] = n ? mass / n : 0;
    f[`inflow${r}`] = inflow;
  }
  const fr = (facing * Math.PI) / 180; // seaward unit vector; onshore = blowing against it
  f.onshoreWind = -((drv.windU ?? 0) * Math.sin(fr) + (drv.windV ?? 0) * Math.cos(fr));
  f.drift = -(T[0] * Math.sin(fr) + T[1] * Math.cos(fr));
  f.clim = clim ?? 0;
  f.seasonSin = Math.sin((2 * Math.PI * doy) / 365.25);
  f.seasonCos = Math.cos((2 * Math.PI * doy) / 365.25);
  return f;
}

// Logistic model stored in model.json: standardized features -> P(event).
export function predict(model, f) {
  let z = model.bias;
  model.features.forEach((k, i) => { z += model.weights[i] * (((f[k] ?? 0) - model.mean[i]) / (model.std[i] || 1)); });
  return 1 / (1 + Math.exp(-z));
}
