// Offline checks of the snow model with synthetic weather. Run: node ski-conditions/scripts/test-model.mjs
import assert from "node:assert/strict";
import { RESORTS } from "../js/resorts.js";
import * as M from "../js/model.js";
import * as O from "../js/ops.js";

// Resort catalog sanity
const ids = new Set();
for (const r of RESORTS) {
  assert(!ids.has(r.id), `duplicate ${r.id}`); ids.add(r.id);
  assert(r.summit > r.base && Math.abs(r.lat) < 70 && Math.abs(r.lon) <= 180, r.id);
}

// Synthetic 17-day hourly series: 3 dry cold days, a 24 h storm with NW wind, then sunny warm spring days.
const res = { lat: 39.6, lon: -106.35, treeline: 3200 };
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

// Segments: a long run that crosses the rain/snow line is snowy on top, wetter at the bottom
const hRain = { ...h, temperature_2m: T.map(() => 1), freezing_level_height: T.map(() => 3150), precipitation: P.map((_, i) => (i >= 72 && i < 96 ? 1.5 : 0)) };
const seg = M.simulateSegments({ top: 3800, bottom: 2400, aspect: 0, slope: 25, difficulty: "advanced", groomed: false }, res, hRain);
console.log("Rain-line run, day after storm AM:", { top: seg.top[d(4)].am.surface, mid: seg.mid[d(4)].am.surface, bottom: seg.bottom[d(4)].am.surface });
assert(seg.top[d(3)].pm.fresh > 10 && seg.bottom[d(3)].pm.fresh < 2, "snow up top, rain at the bottom");
const short = M.simulateSegments({ top: 3100, bottom: 3000, aspect: 0, slope: 10, difficulty: "easy", groomed: true }, res, h);
assert.equal(short.top, short.mid);

// Regional blend: high-res model gets double weight, confidence ignores it
const j = { elevation: 3000, utc_offset_seconds: 0, hourly: { time: ["2026-03-01T00:00"], temperature_2m_gfs_seamless: [0], precipitation_gfs_seamless: [1] } };
const b = M.blend(j, { hourly: { time: ["2026-03-01T00:00"], temperature_2m_ncep_hrrr_conus: [-3], precipitation_ncep_hrrr_conus: [4] } });
assert.deepEqual(b.models, ["gfs_seamless", "ncep_hrrr_conus"]); assert.equal(b.temperature_2m[0], -2); assert.equal(b.precipitation[0], 3);
assert.deepEqual(M.regionalFor({ lat: 39.6, lon: -106.35 }), ["ncep_hrrr_conus", "gem_hrdps_continental"]);
assert.deepEqual(M.regionalFor({ lat: -32.8, lon: -70.1 }), []);

// Skill weights: better model gets more weight; resort scores beat global ones; too little data = none
const skill = { global: { ecmwf_ifs025: { n: 40, mae: 1 }, gfs_seamless: { n: 40, mae: 3 }, icon_seamless: { n: 5, mae: 0 } }, byResort: { alta: { gfs_seamless: { n: 12, mae: 0.5 }, ecmwf_ifs025: { n: 12, mae: 2 } } } };
const g = M.skillWeights(skill, "vail"), a = M.skillWeights(skill, "alta");
assert(g.weights.ecmwf_ifs025 > g.weights.gfs_seamless && !("icon_seamless" in g.weights) && g.source === "global", JSON.stringify(g));
assert(a.weights.gfs_seamless > a.weights.ecmwf_ifs025 && a.source === "resort", JSON.stringify(a));
assert.deepEqual(M.skillWeights({ global: { gfs_seamless: { n: 99, mae: 1 } } }, "x").weights, {});
assert.deepEqual(M.skillWeights(undefined, "x").weights, {});
const wj = { elevation: 3000, hourly: { time: ["t"], temperature_2m_gfs_seamless: [0], precipitation_gfs_seamless: [0], temperature_2m_ecmwf_ifs025: [3], precipitation_ecmwf_ifs025: [3] } };
assert.equal(M.blend(wj, null, { ecmwf_ifs025: 2 }).precipitation[0], 2);
assert.equal(M.blend(wj).weights.ecmwf_ifs025, 1);

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

// ---------- ops / deeper forecasts ----------
assert.equal(O.quantile([1, 2, 3, 4, 5], 0.5), 3); assert.equal(O.quantile([0, 10], 0.1), 1);
const rgDay = { snow: 20, perModel: { ecmwf_ifs025: 25, gfs_seamless: 10, icon_seamless: 30, gem_seamless: 18, ncep_hrrr_conus: 99 } };
const rg = O.snowRange(rgDay);
assert(rg.p10 < rg.p50 && rg.p50 < rg.p90 && rg.n === 5, JSON.stringify(rg)); // regional model excluded
assert(rg.chance > 50 && rg.chance < 100);
assert(Math.abs(O.wetBulb(20, 50) - 13.7) < 0.2, "Stull check: 20 °C, 50 % → 13.7 °C");
assert(O.wetBulb(-2, 40) < -4, "dry air makes snowmaking possible above freezing wet-bulb");
const mkH = { ...h, relative_humidity_2m: T.map(() => 40) };
const nightsMk = O.snowmakingNights(mkH, 3000);
assert(nightsMk.length >= 15 && nightsMk[1].hours === 17, JSON.stringify(nightsMk[1]));
assert(nightsMk.at(-3).hours < nightsMk[1].hours, "warm spring nights: fewer snowmaking hours");
const lifts = O.liftsFromOSM([{ type: "way", id: 9, tags: { aerialway: "chair_lift", name: "Lift 9" }, geometry: [{ lat: 1, lon: 1 }, { lat: 1.01, lon: 1 }] }, { type: "way", id: 10, tags: { aerialway: "goods" }, geometry: [{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }] }]);
assert.equal(lifts.length, 1); assert.equal(lifts[0].name, "Lift 9");
const windy = { ...h, wind_gusts_10m: T.map((_, i) => (i >= 72 && i < 96 ? 90 : 20)) };
const wh = O.windHolds({ type: "chair_lift", top: 3500 }, windy);
assert.equal(wh[d(3)].risk, "likely"); assert.equal(wh[d(1)].risk, "low");
assert.equal(O.windHolds({ type: "gondola", top: 3000 }, { ...h, wind_gusts_10m: T.map(() => 68) })[d(1)].risk, "possible");
const q = O.snowQuality(h, 3500);
assert(q[d(3)].snow > 10 && q[d(3)].slr >= 11.5, `cold storm = dry snow: ${JSON.stringify(q[d(3)])}`);
const simG = [{ run: { name: "Bumpy", difficulty: "intermediate", groomed: false }, byDay: { [d(12)]: { pm: { surface: "slush" } } } }, { run: { name: "Fine", difficulty: "easy" }, byDay: { [d(12)]: { pm: { surface: "cord" } } } }];
const gp = O.groomingPriorities(simG, d(12), d(13), h);
assert.equal(gp.length, 1); assert.match(gp[0].why, /refreezing/);
const snowMap = { base: M.dailySnow(h, 2400), summit: M.dailySnow(h, 3500) };
const fmt = { cm: (v) => `${Math.round(v)} cm`, deg: (v) => `${Math.round(v)}°`, m: (v) => `${v} m` };
const rep = O.draftReport({ name: "Test" }, { date: d(3), snow: snowMap, range: rg, quality: q[d(3)], best: [], holds: [{ name: "Lift 9", risk: "likely" }], making: { hours: 8, prime: 3 }, fmt });
assert.match(rep, /new snow forecast at the summit/); assert.match(rep, /Lift 9/); assert.match(rep, /Snowmaking tonight/);
const seg2 = M.simulateSegments({ top: 3500, bottom: 3000, aspect: 0, slope: 25, difficulty: "advanced", groomed: false }, res, h);
assert.equal(seg2.hourly.mid.length, h.time.length);

console.log(`OK: ${RESORTS.length} resorts, model checks passed`);
