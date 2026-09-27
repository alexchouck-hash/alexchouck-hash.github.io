// Sanity checks for the resort catalog. Run: node scripts/validate-data.mjs
import { RESORTS, REGIONS, AIRPORTS } from "../js/resorts.js";
import { SARG_SEASON, basinOf } from "../js/model.js";

const errs = [];
const ids = new Set();
const m12 = (a) => Array.isArray(a) && a.length === 12 && a.every((v) => typeof v === "number");
for (const [k, g] of Object.entries(REGIONS)) {
  for (const f of ["sst", "crowd"]) if (!m12(g[f])) errs.push(`region ${k}: ${f}`);
  for (const f of ["tmaxF", "tminF", "rainPct", "cloud", "uv"]) if (!m12(g.climate?.[f])) errs.push(`region ${k}: climate.${f}`);
  if (!g.cleanup || !g.safety || !g.tourism || !g.market) errs.push(`region ${k}: missing text fields`);
}
for (const r of RESORTS) {
  if (ids.has(r.id)) errs.push(`duplicate id ${r.id}`);
  ids.add(r.id);
  if (!REGIONS[r.region]) errs.push(`${r.id}: unknown region ${r.region}`);
  if (!SARG_SEASON[basinOf(r)]) errs.push(`${r.id}: unknown basin ${basinOf(r)}`);
  for (const a of r.airports || []) if (!AIRPORTS[a]) errs.push(`${r.id}: unknown airport ${a}`);
  if (!(r.lat > 5 && r.lat < 32 && r.lon > -100 && r.lon < -58)) errs.push(`${r.id}: coordinates out of range`);
  if (!(r.exposure >= 0 && r.exposure <= 1) || !(r.facing >= 0 && r.facing <= 360)) errs.push(`${r.id}: exposure/facing`);
}
console.log(`${RESORTS.length} resorts, ${Object.keys(REGIONS).length} regions, ${Object.keys(AIRPORTS).length} airports`);
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
console.log("ok");
