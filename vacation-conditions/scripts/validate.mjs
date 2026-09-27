// Sanity checks for the vacation destination catalog.
// Run from the repo root: node vacation-conditions/scripts/validate.mjs
import { DESTINATIONS, AIRPORTS } from "../js/destinations.js";
import { ACTIVITIES, buildDay } from "../js/model.js";

const errs = [], ids = new Set();
const m = (a, n = 12) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === "number");
for (const d of DESTINATIONS) {
  if (ids.has(d.id)) errs.push(`duplicate id ${d.id}`); ids.add(d.id);
  if (!d.types?.length || d.types.some((t) => !ACTIVITIES[t])) errs.push(`${d.id}: bad types ${d.types}`);
  if (typeof d.lat !== "number" || typeof d.lon !== "number") errs.push(`${d.id}: coordinates`);
  for (const a of d.airports || []) if (!AIRPORTS[a]) errs.push(`${d.id}: unknown airport ${a}`);
  for (const k of ["tmaxF", "tminF", "precipPct"]) if (!m(d.climate?.[k])) errs.push(`${d.id}: climate.${k}`);
  for (const k of ["crowd", "flight", "hotel"]) if (!m(d[k])) errs.push(`${d.id}: ${k}`);
  if (d.dow && !m(d.dow, 7)) errs.push(`${d.id}: dow`);
  if (d.types.includes("ski") && !d.ski?.open) errs.push(`${d.id}: ski block`);
  if (d.types.includes("fall") && !d.fall?.peak) errs.push(`${d.id}: fall block`);
  if (d.types.includes("hike") && !d.bugs) errs.push(`${d.id}: bugs block`);
  try { buildDay(d, new Date(), new Date()); } catch (e) { errs.push(`${d.id}: model error ${e.message}`); }
}
const by = Object.keys(ACTIVITIES).map((t) => `${t} ${DESTINATIONS.filter((d) => d.types.includes(t)).length}`).join(", ");
console.log(`${DESTINATIONS.length} destinations (${by}), ${Object.keys(AIRPORTS).length} airports`);
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
console.log("ok");
