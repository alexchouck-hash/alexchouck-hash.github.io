// Precomputes every resort's runs (OSM geometry + elevation, aspect, slope) into
// ski/runs/<id>.json on the data-feed branch, so pages skip the slow Overpass call.
// Run: FEED_DIR=feed node ski-conditions/scripts/build-runs.mjs  (from .github/workflows/data.yml)
// Refreshes at most RUNS_BUDGET stale resorts per run (default 15) to be polite to Overpass.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RESORTS } from "../js/resorts.js";
import { liveMap } from "../js/api.js";

const root = new URL((process.env.FEED_DIR || "feed").replace(/\/?$/, "/") + "ski/runs/", new URL("../../", import.meta.url));
const BUDGET = +(process.env.RUNS_BUDGET ?? 15);
const MAX_AGE = 7 * 864e5;
const r5 = (v) => Math.round(v * 1e5) / 1e5;

await mkdir(root, { recursive: true });
// Files from before lifts were added count as stale so they get rebuilt.
const age = async (id) => { try { const j = JSON.parse(await readFile(new URL(`${id}.json`, root), "utf8")); return j.lifts ? Date.now() - Date.parse(j.updated) : Infinity; } catch { return Infinity; } };
const stale = [];
for (const r of RESORTS) { const a = await age(r.id); if (a > MAX_AGE) stale.push([a, r]); }
stale.sort((a, b) => b[0] - a[0]); // missing first, then oldest

let done = 0;
for (const [, r] of stale.slice(0, BUDGET)) {
  try {
    const live = await liveMap(r);
    const lifts = live.lifts.map((l) => ({ ...l, line: l.line.map(([a, b]) => [r5(a), r5(b)]) }));
    const runs = live.runs.map(({ samples, ...run }) => ({ ...run, ways: run.ways.map((w) => w.map(([a, b]) => [r5(a), r5(b)])) }));
    if (!runs.length) { console.warn(`${r.id}: no runs mapped`); continue; }
    await writeFile(new URL(`${r.id}.json`, root), JSON.stringify({ updated: new Date().toISOString(), source: "OpenStreetMap (ODbL) + Open-Meteo elevation", runs, lifts }));
    done++;
  } catch (e) { console.warn(`${r.id}: ${e.message}`); }
  await new Promise((res) => setTimeout(res, 5000));
}
console.log(`runs: refreshed ${done}/${Math.min(BUDGET, stale.length)} (${stale.length} stale of ${RESORTS.length})`);
