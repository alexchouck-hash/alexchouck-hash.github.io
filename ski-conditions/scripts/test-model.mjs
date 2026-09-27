// Offline checks of the snow model with synthetic weather. Run: node ski-conditions/scripts/test-model.mjs
import assert from "node:assert/strict";
import { RESORTS } from "../js/resorts.js";
import * as M from "../js/model.js";

// Resort catalog sanity
const ids = new Set();
for (const r of RESORTS) {
  assert(!ids.has(r.id), `duplicate ${r.id}`); ids.add(r.id);
  assert(r.summit > r.base && Math.abs(r.lat) < 70 && Math.abs(r.lon) <= 180, r.id);
}

// Synthetic 17-day hourly series: 3 dry cold days, a 24 h storm with NW wind, then sunny warm spring days.
const res = { lat: 39.6, lon: -106.35, treeline: 3400 };
const n = 17 * 24, time = [], T = [], P = [], FL = [], W = [], D = [], SW = [], depth = [];
for (let i = 0; i < n; i++) {
  const day = Math.floor(i / 24), hr = i % 24;
  time.push(new Date(Date.UTC(2026, 2, 1 + day, hr)).toISOString().slice(0, 16));
  const storm = day === 3;
  const warm = day >= 6;
  const diurnal = Math.sin(((hr - 9) / 24) * 2 * Math.PI) * 5;
  const t = (storm ? -8 : warm ? -2 : -6) + diurnal;
  T.push(t); P.push(storm ? 1.2 : 0); FL.push(3000 + t * 150); W.push(storm ? 45 : 10); D.push(315);
  const sunUp = hr >= 7 && hr <= 17;
  SW.push(sunUp && !storm ? 700 * Math.sin(((hr - 7) / 10) * Math.PI) : 0); depth.push(1.0);
}
const h = { time, utcOffset: -6 * 3600, refElev: 3000, models: ["x"], temperature_2m: T, precipitation: P, freezing_level_height: FL, wind_speed_10m: W, wind_direction_10m: D, wind_gusts_10m: W, shortwave_radiation: SW, cloud_cover: T.map(() => 0), snow_depth: depth, perModel: {} };

// Physics helpers
assert.equal(M.snowFraction(-5), 1); assert.equal(M.snowFraction(5), 0);
assert(M.slr(-15) > M.slr(-1), "colder snow is fluffier");
assert(M.windFactor(50, 315, 135, true) > 1.4, "SE face is lee of NW wind");
assert(M.windFactor(50, 315, 315, true) < 0.6, "NW face is windward");
const noonSun = M.sun(Date.UTC(2026, 2, 10, 19), 39.6, -106.35);
assert(noonSun.cosZ > 0.6 && Math.abs(noonSun.az - 180) < 20, `sun due south at noon: ${JSON.stringify(noonSun)}`);
assert(M.slopeRadiation(700, noonSun, 30, 180) > 2 * M.slopeRadiation(700, noonSun, 30, 0), "south face gets more sun");

const run = (aspect, groomed, difficulty = "advanced") => M.runDays(M.simulateRun({ top: 3500, bottom: 3000, aspect, slope: 28, difficulty, groomed }, res, h), h);
const lee = run(135, false), windward = run(315, false), groomed = run(135, true, "intermediate"), south = run(180, false), north = run(0, false);
const d = (k) => time[k * 24].slice(0, 10);

console.log("Day after storm, AM:", { lee: lee[d(4)].am.surface, windward: windward[d(4)].am.surface, groomed: groomed[d(4)].am.surface });
assert(lee[d(4)].am.fresh > windward[d(4)].am.fresh * 1.5, "lee slope holds more new snow");
assert(["deep", "powder"].includes(lee[d(4)].am.surface));
assert.equal(lee[d(4)].am.score > lee[d(4)].pm.score, true, "powder gets tracked out by afternoon");
console.log("Spring days (south vs north):", [8, 10, 12].map((k) => `${south[d(k)].am.surface}/${south[d(k)].pm.surface} vs ${north[d(k)].am.surface}/${north[d(k)].pm.surface}`));
assert(south[d(12)].pm.Teff > north[d(12)].pm.Teff + 2, "south face warmer in the sun");
assert(["corn", "wet", "slush"].includes(south[d(12)].pm.surface), "south face softens in spring afternoons");
assert(["crust", "ice", "hardpack", "packed", "cord"].includes(south[d(12)].am.surface), "refrozen in the morning");

// Rain/snow line
const low = M.atElevation(h, 72, 2000), high = M.atElevation(h, 72, 3500);
assert(high.snowCm > low.snowCm, "more snow up high");

// OSM grouping + geometry
const els = [
  { type: "way", id: 1, tags: { "piste:type": "downhill", name: "Riva Ridge", "piste:difficulty": "intermediate" }, geometry: [{ lat: 39.60, lon: -106.35 }, { lat: 39.61, lon: -106.35 }] },
  { type: "way", id: 2, tags: { "piste:type": "downhill", name: "Riva Ridge", "piste:difficulty": "intermediate" }, geometry: [{ lat: 39.61, lon: -106.35 }, { lat: 39.62, lon: -106.35 }] },
  { type: "way", id: 3, tags: { "piste:type": "nordic" }, geometry: [{ lat: 39.6, lon: -106.3 }, { lat: 39.7, lon: -106.3 }] },
];
const rs = M.runsFromOSM(els);
assert.equal(rs.length, 1); assert.equal(rs[0].ways.length, 2); assert(rs[0].groomed);
const fin = M.finishRun(rs[0], [3400, 3300, 3200, 3100, 3000]);
assert.equal(M.compass(fin.aspect), "N"); assert(fin.slope > 5 && fin.slope < 20, `slope ${fin.slope}`);
assert.equal(M.virtualRuns(RESORTS[0]).length, 12);

console.log(`OK: ${RESORTS.length} resorts, model checks passed`);
