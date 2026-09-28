// Public JSON forecast feed: every resort, rebuilt each feed run (every 6 h).
//   ski/forecast/index.json      one line per resort (headline numbers)
//   ski/forecast/<id>.json        full forecast (schema in ski-conditions/README.md)
// Uses the same blend, skill weights, bias correction and run simulation as the
// website, so apps, signage and MCP clients get exactly what visitors see.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RESORTS } from "../js/resorts.js";
import { SURFACES, MODEL_LABEL, simulateSegments, skillWeights, biasFactor, dailySnow, days, virtualRuns, snowLine } from "../js/model.js";
import { snowRange, snowQuality, snowmakingNights, windHolds } from "../js/ops.js";
import * as api from "../js/api.js";

const feed = new URL((process.env.FEED_DIR || "feed").replace(/\/?$/, "/") + "ski/", new URL("../../", import.meta.url));
const f = (p) => new URL(p, feed);
const readJSON = async (p) => { try { return JSON.parse(await readFile(f(p), "utf8")); } catch { return null; } };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const SCHEMA_VERSION = 1;

// Build one resort's feed document from a blended forecast and its runs/lifts.
export function buildResort(r, h, runs, lifts, meta = {}) {
  const today = new Date(Date.now() + h.utcOffset * 1000).toISOString().slice(0, 10);
  const up = days(h).filter((d) => d >= today).slice(0, 10);
  const mid = (r.base + r.summit) / 2;
  const snow = { base: dailySnow(h, r.base), mid: dailySnow(h, mid), summit: dailySnow(h, r.summit) };
  const quality = snowQuality(h, r.summit);
  const making = Object.fromEntries(["base", "mid", "summit"].map((k) => [k, Object.fromEntries(snowmakingNights(h, { base: r.base, mid, summit: r.summit }[k]).map((n) => [n.date, n]))]));
  const sim = runs.map((run) => ({ run, seg: simulateSegments(run, r, h) }));
  const holds = lifts.map((l) => ({ l, d: windHolds(l, h) }));
  const dayDoc = up.map((d) => {
    const s = snow.summit[d], rg = snowRange(s), noon = h.time.indexOf(`${d}T12:00`);
    const am = sim.map((x) => ({ x, st: x.seg.mid[d]?.am })).filter((y) => y.st && y.st.surface !== "closed");
    return {
      date: d,
      summit: { snowCm: r1(s.snow), p10: r1(rg?.p10), p50: r1(rg?.p50), p90: r1(rg?.p90), powderChancePct: rg?.chance ?? null, quality: quality[d]?.snow >= 2 ? quality[d].label : null, tMinC: r1(s.Tmin), tMaxC: r1(s.Tmax), windMaxKmh: Math.round(s.windMax) },
      mid: { snowCm: r1(snow.mid[d].snow) },
      base: { snowCm: r1(snow.base[d].snow), rainMm: r1(snow.base[d].rain) },
      snowLineM: noon >= 0 ? snowLine(h, noon) : null,
      snowmakingHours: Object.fromEntries(["base", "mid", "summit"].map((k) => [k, making[k][d] ? { hours: making[k][d].hours, prime: making[k][d].prime } : null])),
      runsOpenPct: sim.length ? Math.round((am.length / sim.length) * 100) : null,
      bestRuns: am.sort((a, b) => b.st.score - a.st.score).slice(0, 5).map(({ x, st }) => ({ name: x.run.name, surface: st.surface, score: st.score })),
      liftWindHolds: { likely: holds.filter((x) => x.d[d]?.risk === "likely").map((x) => x.l.name), possible: holds.filter((x) => x.d[d]?.risk === "possible").map((x) => x.l.name) },
    };
  });
  return {
    schema: SCHEMA_VERSION, updated: new Date().toISOString(),
    resort: { id: r.id, name: r.name, country: r.country, region: r.region, lat: r.lat, lon: r.lon, baseM: r.base, summitM: r.summit },
    models: h.models.map((m) => ({ id: m, label: MODEL_LABEL[m], weight: h.weights[m] })), biasCorrection: h.correction ?? 1, ...meta,
    days: dayDoc,
    runsToday: sim.map((x) => ({ name: x.run.name, difficulty: x.run.difficulty, groomed: !!x.run.groomed, virtual: !!x.run.virtual, am: x.seg.mid[today]?.am ? { surface: x.seg.mid[today].am.surface, score: x.seg.mid[today].am.score } : null, pm: x.seg.mid[today]?.pm ? { surface: x.seg.mid[today].pm.surface, score: x.seg.mid[today].pm.score } : null })),
    surfaces: Object.fromEntries(Object.entries(SURFACES).map(([k, v]) => [k, v.label])),
  };
}

// Resort point on a terrain model vs listed base/summit (±300 m slack: the point
// may sit on a village, a valley or a ridge).
export function catalogCheck(resorts, dem, slack = 300) {
  const flagged = [];
  resorts.forEach((r, k) => {
    const z = dem[k];
    if (z == null) return;
    if (z < r.base - slack || z > r.summit + slack) flagged.push({ id: r.id, name: r.name, demM: Math.round(z), baseM: r.base, summitM: r.summit });
  });
  return { checked: resorts.length, flagged };
}

if (process.env.FORECASTS_NO_MAIN !== "1") {
  await mkdir(f("forecast/"), { recursive: true });
  const v = await readJSON("verification.json");
  const index = { schema: SCHEMA_VERSION, updated: new Date().toISOString(), resorts: [] };
  for (const r of RESORTS) {
    try {
      const map = (await readJSON(`runs/${r.id}.json`)) || {};
      const runs = map.runs?.length ? map.runs : virtualRuns(r);
      const h = await api.forecast(r, 0, skillWeights(v?.skill, r.id).weights, biasFactor(v?.correction, r.id));
      const doc = buildResort(r, h, runs, map.lifts || [], { climate: (await readJSON(`climate/${r.id}.json`))?.season ?? null });
      await writeFile(f(`forecast/${r.id}.json`), JSON.stringify(doc));
      const d0 = doc.days[0], next3 = doc.days.slice(0, 3).reduce((a, x) => a + (x.summit.snowCm || 0), 0);
      index.resorts.push({ id: r.id, name: r.name, country: r.country, region: r.region, todaySummitCm: d0?.summit.snowCm ?? null, next3SummitCm: r1(next3), powderChancePct: d0?.summit.powderChancePct ?? null, runsOpenPct: d0?.runsOpenPct ?? null, url: `forecast/${r.id}.json` });
    } catch (e) { console.warn(`${r.id}: ${e.message}`); }
    await sleep(500);
  }
  await writeFile(f("forecast/index.json"), JSON.stringify(index));
  // Catalog check: the resort's map point should sit between its base and summit
  // on a terrain model. Flags typos in coordinates or elevations.
  try {
    const dem = await api.elevations(RESORTS.map((r) => [r.lat, r.lon]));
    const check = catalogCheck(RESORTS, dem);
    await writeFile(f("catalog-check.json"), JSON.stringify({ updated: new Date().toISOString(), ...check }));
    console.log(`catalog check: ${check.flagged.length} of ${RESORTS.length} resorts flagged`);
    for (const x of check.flagged) console.warn(`  ${x.id}: terrain ${x.demM} m vs listed ${x.baseM}–${x.summitM} m`);
  } catch (e) { console.warn(`catalog check skipped: ${e.message}`); }
  console.log(`forecast feed: ${index.resorts.length}/${RESORTS.length} resorts`);
}
