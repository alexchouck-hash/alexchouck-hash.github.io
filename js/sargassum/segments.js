// Coastal segments for the sargassum model: resorts grouped on a 0.5° grid so
// satellite and driver history is collected once per stretch of coast.
// Shared by the browser (runtime forecast) and the Node collectors/trainer.

import { RESORTS } from "../resorts.js";

export const STEP = 0.5;
// Rings (km from the segment center) and 8 compass sectors used for satellite features.
export const RINGS = [[0, 20], [20, 60], [60, 120]];
export const SECTORS = 8;
export const BOX_DEG = 1.15; // half-width of the sampled box (~120 km)

export const segmentKey = (lat, lon) => `${Math.round(lat / STEP) * STEP}_${Math.round(lon / STEP) * STEP}`.replace(/\.0(?=_|$)/g, "");

function circularMean(degs) {
  let x = 0, y = 0;
  for (const d of degs) { x += Math.cos((d * Math.PI) / 180); y += Math.sin((d * Math.PI) / 180); }
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

export const SEGMENTS = (() => {
  const by = new Map();
  for (const r of RESORTS) {
    const k = segmentKey(r.lat, r.lon);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return [...by].map(([key, rs]) => ({
    key,
    lat: +(rs.reduce((a, r) => a + r.lat, 0) / rs.length).toFixed(4),
    lon: +(rs.reduce((a, r) => a + r.lon, 0) / rs.length).toFixed(4),
    facing: circularMean(rs.map((r) => r.facing)),
    resorts: rs.map((r) => r.id),
  }));
})();
export const SEGMENT_OF = Object.fromEntries(SEGMENTS.flatMap((s) => s.resorts.map((id) => [id, s.key])));

// Great-circle distance (km) and initial bearing (deg) from a to b.
export function distBearing(lat1, lon1, lat2, lon2) {
  const t = Math.PI / 180, R = 6371;
  const dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(a));
  const y = Math.sin(dLon) * Math.cos(lat2 * t), x = Math.cos(lat1 * t) * Math.sin(lat2 * t) - Math.sin(lat1 * t) * Math.cos(lat2 * t) * Math.cos(dLon);
  return [km, ((Math.atan2(y, x) / t) + 360) % 360];
}
