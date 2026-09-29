// Model checks for every Bluebird site. Run: node bluebird/tests/test.mjs
import assert from "node:assert/strict";
import { moon, grade, SITES } from "../assets/shared.js";
import { SPOTS } from "../foliage/spots.js";
import * as F from "../foliage/model.js";
import * as R from "../rivers/model.js";
import * as O from "../offshore/model.js";
import { nights } from "../camp/model.js";
import { FALLS } from "../waterfalls/spots.js";
import { EVENTS } from "../events/catalog.js";
import * as EV from "../events/model.js";
process.env.EVENTS_NO_MAIN = "1";
const { parseTicketmaster } = await import("../scripts/build-events.mjs");
import * as WF from "../waterfalls/model.js";

// Shared
assert.equal(SITES.length, 8);
assert(moon(new Date("2026-01-03T10:00Z")).illum > 0.95, "full moon Jan 3 2026");
assert(moon(new Date("2026-01-18T19:00Z")).illum < 0.05, "new moon Jan 18 2026");
assert.equal(grade(90).label, "Bluebird"); assert.equal(grade(10).label, "Stay home");

// Foliage
const ids = new Set(SPOTS.map((s) => s.id)); assert.equal(ids.size, SPOTS.length);
for (const s of SPOTS) assert(/^(09|10|11)-\d\d$/.test(s.peak), s.id);
const series = (year, fn) => { const date = [], tmean = [], tmin = [], tmax = [], precip = []; for (let n = F.doyOf(`${year}-08-01`); n <= F.doyOf(`${year}-11-30`); n++) { const d = F.fromDoy(year, n); const t = fn(n); date.push(d); tmean.push(t); tmin.push(t - 6); tmax.push(t + 6); precip.push(n % 4 ? 0 : 12); } return { date, tmean, tmin, tmax, precip }; };
const cat = (...xs) => Object.fromEntries(Object.keys(xs[0]).map((k) => [k, xs.flatMap((x) => x[k])]));
const normal = (n) => 20 - (n - 213) * 0.2; // cooling through autumn
const past = cat(series(2023, normal), series(2024, normal), series(2025, normal));
const stowe = SPOTS.find((s) => s.id === "stowe");
const same = F.predict(stowe, "2026-09-27", series(2026, normal), past);
const warm = F.predict(stowe, "2026-09-27", series(2026, (n) => normal(n) + 3), past);
const dry = F.predict(stowe, "2026-09-27", { ...series(2026, normal), precip: series(2026, normal).precip.map(() => 0.5) }, past);
assert.equal(same.shift, 0); assert.equal(same.peak, "2026-10-03");
assert(warm.shift >= 7 && warm.peak > same.peak, `warm autumn delays peak: ${warm.shift}`);
assert(dry.drought && dry.shift < 0 && dry.brilliance < same.brilliance, "drought: earlier, duller");
assert.equal(F.colorPct(0), 100); assert(F.colorPct(-14) < 40 && F.colorPct(10) < 25);
assert.equal(F.stage(1).label, "Peak color"); assert.equal(F.stage(-30).label, "Mostly green");
const fcD = { date: ["2026-09-27", "2026-09-28", "2026-09-29"], tmax: [15, 15, 15], precip: [0, 12, 0], pop: [0, 90, 0], cloud: [10, 100, 10], gust: [20, 30, 20] };
const bd = F.bestDays({ ...same, peakDoy: F.doyOf("2026-09-28") }, "2026-09-27", fcD);
assert(bd[0].score > bd[1].score, "sunny day near peak beats a rainy peak day");

// Rivers
const iv = { value: { timeSeries: [
  { sourceInfo: { siteName: "NANTAHALA RIVER NEAR HEWITT, NC", siteCode: [{ value: "03505550" }], geoLocation: { geogLocation: { latitude: 35.3, longitude: -83.6 } } }, variable: { variableCode: [{ value: "00060" }], noDataValue: -999999 },
    values: [{ value: [{ value: "500", dateTime: "2026-09-26T12:00:00.000-04:00" }, { value: "-999999", dateTime: "2026-09-26T18:00:00.000-04:00" }, { value: "900", dateTime: "2026-09-27T12:00:00.000-04:00" }] }] },
  { sourceInfo: { siteName: "X", siteCode: [{ value: "03505550" }], geoLocation: { geogLocation: {} } }, variable: { variableCode: [{ value: "00065" }] }, values: [{ value: [{ value: "2.5", dateTime: "2026-09-27T12:00:00.000-04:00" }] }] },
] } };
const g = R.parseIV(iv)["03505550"];
assert.equal(g.flow, 900); assert.equal(g.flowPrev, 500); assert.equal(g.stage, 2.5); assert.equal(g.name, "Nantahala River near Hewitt, NC");
assert.equal(R.trend(g.flow, g.flowPrev), "rising");
const rdb = "# comment\nagency_cd\tsite_no\tparameter_cd\tts_id\tloc_web_ds\tmonth_nu\tday_nu\tbegin_yr\tend_yr\tcount_nu\tp10_va\tp25_va\tp50_va\tp75_va\tp90_va\n5s\t15s\t5s\t10n\t15s\t3n\t3n\t6n\t6n\t8n\t12s\t12s\t12s\t12s\t12s\nUSGS\t03505550\t00060\t1\t\t9\t26\t1990\t2025\t35\t100\t200\t400\t800\t1600\nUSGS\t03505550\t00060\t1\t\t9\t27\t1990\t2025\t35\t110\t220\t440\t880\t1760\n";
const st = R.parseStats(rdb, 9, 27)["03505550"];
assert.deepEqual(st, { p10: 110, p25: 220, p50: 440, p75: 880, p90: 1760 });
assert.equal(R.percentile(440, st), 50); assert.equal(R.percentile(880, st), 75);
assert(R.percentile(50, st) < 10 && R.percentile(5000, st) > 90);
assert.equal(R.rate(50, 440, 430), "normal"); assert.equal(R.rate(92, 2000, 1000), "flood"); assert.equal(R.rate(5, 40, 40), "verylow"); assert.equal(R.rate(null), "unknown");
const box = R.clampBox([-90, 30, -80, 40]); assert((box[2] - box[0]) * (box[3] - box[1]) <= 24.01);

// Offshore
const calm = O.hourScore("small", { wave: 0.4, period: 9, wind: 10, gust: 15, cape: 0, pop: 0 });
const rough = O.hourScore("small", { wave: 1.6, period: 5, wind: 35, gust: 45, cape: 0, pop: 0 });
assert(calm >= 80 && rough < 25, `${calm} ${rough}`);
assert(O.hourScore("large", { wave: 1.6, period: 5, wind: 35, gust: 45 }) > rough, "bigger boat handles more");
assert(O.effectiveWave(1, 5) > O.effectiveWave(1, 12));
assert.equal(O.tempBreak(26, [26.2, 24.8, null]), 1.2);
const oh = { time: Array.from({ length: 48 }, (_, i) => `2026-09-${27 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`) };
for (const k of ["wave", "period", "wind", "gust", "cape", "pop", "sst"]) oh[k] = oh.time.map((_, i) => ({ wave: i < 24 ? 0.5 : 2, period: 8, wind: 12, gust: 18, cape: 0, pop: 0, sst: 27 })[k]);
const od = O.days("small", oh); assert.equal(od.length, 2); assert(od[0].score > od[1].score);

// Camp
const ch = { time: Array.from({ length: 72 }, (_, i) => `2026-09-${27 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`) };
Object.assign(ch, { temp: ch.time.map(() => 10), dew: ch.time.map(() => 2), rh: ch.time.map(() => 50), precip: ch.time.map((_, i) => (i >= 42 && i < 48 ? 3 : 0)), pop: ch.time.map(() => 10), wind: ch.time.map(() => 5), gust: ch.time.map(() => 10), cloud: ch.time.map((_, i) => (i < 30 ? 0 : 90)), cape: ch.time.map(() => 0) });
const n = nights(ch, () => 0);
assert.equal(n.length, 2);
assert(n[0].score > n[1].score && n[0].stars > n[1].stars, JSON.stringify(n));
assert(!n[0].frost && !n[0].bugs);

// Waterfalls
assert.equal(new Set(FALLS.map((f) => f.id)).size, FALLS.length);
for (const f of FALLS) assert(f.months?.length === 12 && WF.RAIN_WEIGHT[f.regime] != null, f.id);
const yos = FALLS.find((f) => f.id === "yosemite"), kaat = FALLS.find((f) => f.id === "kaaterskill"), burney = FALLS.find((f) => f.id === "burney");
assert(WF.seasonal(yos, "2026-05-15") > 90 && WF.seasonal(yos, "2026-09-15") < 15, "Yosemite: roaring May, dry September");
const normal30 = Array.from({ length: 30 }, (_, i) => (i % 5 ? 0 : 15));
const soaked = normal30.map((p, i) => (i >= 27 ? 40 : p)), dry30 = normal30.map(() => 0);
const k1 = WF.flowNow(kaat, "2026-09-27", soaked, [normal30, normal30]), k0 = WF.flowNow(kaat, "2026-09-27", dry30, [normal30, normal30]);
assert(k1.flow >= 65 && k0.flow < 25, `rain-fed fall responds to rain: ${k1.flow} vs ${k0.flow}`);
const b1 = WF.flowNow(burney, "2026-09-27", soaked, [normal30]), b0 = WF.flowNow(burney, "2026-09-27", dry30, [normal30]);
assert(Math.abs(b1.flow - b0.flow) <= 6, "spring-fed fall barely changes");
assert(WF.flowNow(kaat, "2026-01-20", normal30, [normal30], [-8, -9, -10, -7, -6]).frozen);
const ol = WF.outlook(kaat, k0, k0.norm, { date: ["2026-09-27", "2026-09-28", "2026-09-29"], precip: [0, 50, 0], tmax: [20, 18, 20], cloud: [20, 100, 10] });
assert(ol[2].flow > ol[0].flow + 20, "storm ahead raises flow");
assert(ol[2].score > ol[1].score, "day after the storm beats the storm day");
assert.equal(WF.flowClass(90).label, "Roaring"); assert.equal(WF.flowClass(5).label, "Trickle");

// Events
assert.equal(EV.iso(EV.easter(2026)), "2026-04-05"); assert.equal(EV.iso(EV.easter(2027)), "2027-03-28");
assert.equal(EV.iso(EV.nthWeekday(2026, 10, 4, 4)), "2026-11-26"); // Thanksgiving
assert.equal(EV.iso(EV.nthWeekday(2026, 8, 1, 1)), "2026-09-07"); // Labor Day
assert.equal(EV.iso(EV.nthWeekday(2026, 3, 5, -1)), "2026-04-24"); // last Friday of April
const byId = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
for (const e of EVENTS) for (const y of [2026, 2027]) { const r = EV.resolve(e.rule, y); assert(r && r.start <= r.end, `${e.id} ${y}`); assert(e.impact >= 1 && e.impact <= 3); }
assert.deepEqual(EV.resolve(byId["mardi-gras-nola"].rule, 2026), { start: "2026-02-05", end: "2026-02-17" }); // ends Fat Tuesday
assert.deepEqual(EV.resolve(byId["telluride-film"].rule, 2026), { start: "2026-09-04", end: "2026-09-07" }); // Labor Day weekend
assert.deepEqual(EV.resolve(byId["nozawa-fire"].rule, 2027), { start: "2027-01-15", end: "2027-01-15" });
const aspen = EV.eventsNear(EVENTS, [{ name: "Concert", start: "2027-06-20", lat: 39.19, lon: -106.82 }, { name: "Far", start: "2027-06-20", lat: 10, lon: 10 }], [39.19, -106.82], "2027-06-01", "2027-06-30", 80);
assert(aspen.some((e) => e.id === "food-wine-aspen") && aspen.some((e) => e.name === "Concert") && !aspen.some((e) => e.name === "Far"));
assert(!aspen.some((e) => e.id === "telluride-film"), "outside date range");
const peaks = EV.usTravelPeaks(2026);
const xmas = EV.demandFor("2026-12-26", { peaks }), quiet = EV.demandFor("2026-10-13", { peaks });
assert(xmas.score >= 80 && EV.demandLabel(xmas.score).label === "Peak", JSON.stringify(xmas));
assert(quiet.score < 40 && EV.demandLabel(quiet.score).label === "Low");
assert(EV.demandFor("2026-10-13", { peaks, events: [{ name: "Big", start: "2026-10-13", end: "2026-10-13", impact: 3 }] }).score > quiet.score + 30);
const ics = EV.toICS([{ id: "x", name: "Fest, big; fun", start: "2026-02-05", end: "2026-02-17", approximate: true }]);
assert(ics.includes("DTSTART;VALUE=DATE:20260205") && ics.includes("DTEND;VALUE=DATE:20260218") && ics.includes("SUMMARY:Fest\\, big\\; fun") && ics.startsWith("BEGIN:VCALENDAR"));
const tm = parseTicketmaster({ _embedded: { events: [{ id: "1", name: "Show", url: "https://x", dates: { start: { localDate: "2026-12-01" } }, classifications: [{ segment: { name: "Music" } }], _embedded: { venues: [{ name: "Hall", city: { name: "Aspen" }, state: { stateCode: "CO" }, location: { latitude: "39.19", longitude: "-106.82" } }] } }, { id: "2", name: "No venue", dates: { start: { localDate: "2026-12-01" } } }] } });
assert.equal(tm.length, 1); assert.equal(tm[0].town, "Aspen, CO"); assert.equal(tm[0].category, "music");


// Hub pulse
const P = await import("../assets/pulse.js");
const sep = P.seasonOrder(SITES, new Date("2026-09-28T12:00Z")).map((s) => s.id), jan = P.seasonOrder(SITES, new Date("2026-01-15T12:00Z")).map((s) => s.id);
assert.equal(sep[0], "foliage", "foliage leads in late September"); assert.equal(jan[0], "snow", "snow leads in January");
assert.equal(sep.length, SITES.length);
assert.deepEqual([4, 7, 12, 19, 23].map(P.sky), ["night", "dawn", "day", "dusk", "night"]);
assert.match(P.foliageReading("2026-09-28").text, /peak|Turning/i); assert.equal(P.foliageReading("2026-06-15").text, "Off season");
assert.equal(P.snowReading([{ name: "A", cm: 0 }]).score, undefined); assert.equal(P.snowReading([{ name: "A", cm: 5 }, { name: "B", cm: 30 }]).text, "Most new snow: B");
assert(P.beachDay("x", { temperature_2m_max: [0, 29], precipitation_probability_max: [0, 0], wind_speed_10m_max: [0, 10] }, 1).score === 100);
const cat1 = [{ name: "Small", town: "A", impact: 1, rule: { fixed: ["10-01", 2] } }, { name: "Big", town: "B", impact: 3, rule: { fixed: ["10-20", 3] } }, { name: "Later", town: "C", impact: 3, rule: { fixed: ["12-01", 1] } }];
const er = P.eventsReading("2026-09-29", cat1);
assert.equal(er.text, "Coming up: Big"); assert.match(er.sub, /\+1 more/); assert.equal(er.score, undefined, "events are info, not a bluebird score");
assert.equal(P.eventsReading("2026-10-21", cat1).text, "On now: Big");
assert.match(P.eventsReading("2026-06-01", cat1).text, /quiet/);
assert(P.eventsReading("2026-09-29").text, "real catalog resolves");
const tp = P.topPicks([null, { score: 90, place: "A" }, { score: 50, place: "B" }, { score: 70, place: "C" }, { score: 99 }, { score: 80, place: "D" }, { score: 66, place: "E" }]);
assert.deepEqual(tp.map((x) => x.place), ["A", "D", "C", "E"], "picks: Good or better, placed, best first, max 4");

console.log(`OK: shared, foliage (${SPOTS.length} spots), rivers, offshore, camp, waterfall (${FALLS.length}), events (${EVENTS.length}) and hub pulse models`);
