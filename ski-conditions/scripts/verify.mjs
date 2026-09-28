// Forecast verification against SNOTEL snow stations (USDA NRCS AWDB, no key).
// Run daily from .github/workflows/data.yml:  FEED_DIR=feed node ski-conditions/scripts/verify.mjs
//
// 1. Pair each resort with the nearest SNOTEL station (within 20 km).
// 2. Once per UTC day, save the forecast daily snowfall at that station's
//    elevation (blend + every model) to ski/forecasts/<issue date>.json.
// 3. Pull observed snow depth, derive daily new snow, and score every saved
//    forecast by lead time: MAE, bias and ≥5 cm event hit rate.
// Observed new snow = positive day-over-day depth change. Settling makes this
// undercount real snowfall, so it is a conservative yardstick (read bias with that in mind).

import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { RESORTS } from "../js/resorts.js";
import { dailySnow, distM, MODEL_LABEL, skillWeights, biasFactor } from "../js/model.js";
import * as api from "../js/api.js";

const root = new URL((process.env.FEED_DIR || "feed").replace(/\/?$/, "/") + "ski/", new URL("../../", import.meta.url));
const f = (p) => new URL(p, root);
const readJSON = async (p) => { try { return JSON.parse(await readFile(f(p), "utf8")); } catch { return null; } };
const writeJSON = async (p, v) => { await mkdir(new URL(".", f(p)), { recursive: true }); await writeFile(f(p), JSON.stringify(v)); };
const AWDB = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1";
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(s + "T00:00Z") + n * 864e5));
const TODAY = iso(new Date());
const KEEP_DAYS = 60, MAX_LEAD = 5, EVENT_CM = 5;

async function get(url) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (r.ok) return await r.json(); if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${url}`); }
    catch (e) { if (i >= 3 || /^\d{3} /.test(e.message)) throw e; }
    await new Promise((res) => setTimeout(res, 2000 * 2 ** i));
  }
}

// ---------- 1. station pairing (refreshed monthly) ----------
async function stations() {
  const cached = await readJSON("stations.json");
  if (cached && Date.now() - Date.parse(cached.updated) < 30 * 864e5) return cached.pairs;
  const list = await get(`${AWDB}/stations?stationTriplets=*:*:SNTL&returnForecastPointMetadata=false&returnReservoirMetadata=false&returnStationElements=false&activeOnly=true`);
  const pairs = {};
  for (const r of RESORTS) {
    let best = null;
    for (const s of list) {
      if (s.latitude == null || s.longitude == null) continue;
      const km = distM([r.lat, r.lon], [s.latitude, s.longitude]) / 1000;
      const elevM = (s.elevation ?? 0) * 0.3048;
      // Prefer stations inside the resort's elevation range: 1 km of distance ≈ 150 m of elevation mismatch.
      const off = Math.max(0, r.base - 300 - elevM, elevM - r.summit - 300);
      const cost = km + off / 150;
      if (km <= 20 && (!best || cost < best.cost)) best = { triplet: s.stationTriplet, name: s.name, lat: s.latitude, lon: s.longitude, elevM: Math.round(elevM), km: +km.toFixed(1), cost };
    }
    if (best) { delete best.cost; pairs[r.id] = best; }
  }
  await writeJSON("stations.json", { updated: new Date().toISOString(), source: "USDA NRCS SNOTEL", pairs });
  return pairs;
}

// ---------- 2. forecast snapshot ----------
async function snapshot(pairs) {
  const path = `forecasts/${TODAY}.json`;
  if (await readJSON(path)) return console.log(`snapshot ${TODAY} exists`);
  const out = { issued: new Date().toISOString(), resorts: {} };
  const prev = await readJSON("verification.json"), skill = prev?.skill;
  for (const r of RESORTS.filter((x) => pairs[x.id])) {
    try {
      // Same skill weighting the page uses, so the saved "blend" is what visitors saw.
      // raw = before bias correction; the correction is always learned from raw forecasts.
      const f = biasFactor(prev?.correction, r.id);
      const h = await api.forecast(r, 0, skillWeights(skill, r.id).weights, f);
      const byDay = dailySnow(h, pairs[r.id].elevM);
      const days = {};
      for (const [d, v] of Object.entries(byDay)) if (d >= TODAY) days[d] = { blend: +v.snow.toFixed(1), raw: +(v.snow / f).toFixed(1), models: Object.fromEntries(Object.entries(v.perModel).map(([m, x]) => [m, +(x / f).toFixed(1)])) };
      out.resorts[r.id] = days;
    } catch (e) { console.warn(`forecast ${r.id}: ${e.message}`); }
    await new Promise((res) => setTimeout(res, 400));
  }
  await writeJSON(path, out);
  console.log(`snapshot ${TODAY}: ${Object.keys(out.resorts).length} resorts`);
}

// ---------- 3. observations ----------
async function observations(pairs) {
  const triplets = [...new Set(Object.values(pairs).map((p) => p.triplet))];
  const obs = {};
  for (let k = 0; k < triplets.length; k += 20) {
    const j = await get(`${AWDB}/data?stationTriplets=${triplets.slice(k, k + 20).join(",")}&elements=SNWD&duration=DAILY&beginDate=${addDays(TODAY, -KEEP_DAYS - 2)}&endDate=${TODAY}`);
    for (const st of j) {
      const vals = (st.data || []).find((d) => d.stationElement?.elementCode === "SNWD")?.values || st.data?.[0]?.values || [];
      const depth = Object.fromEntries(vals.filter((v) => v.value != null).map((v) => [v.date.slice(0, 10), v.value * 2.54]));
      // Depth is read at midnight, so snow that fell on day D shows up in D+1's reading.
      const fresh = {};
      for (const d of Object.keys(depth)) { const nxt = depth[addDays(d, 1)]; if (nxt != null) fresh[d] = Math.max(0, nxt - depth[d]); }
      obs[st.stationTriplet] = fresh;
    }
  }
  return obs;
}

// ---------- 4. scoring ----------
const blank = () => ({ n: 0, absErr: 0, err: 0, hits: 0, misses: 0, falseAlarms: 0 });
function add(s, fc, ob) {
  s.n++; s.absErr += Math.abs(fc - ob); s.err += fc - ob;
  if (ob >= EVENT_CM && fc >= EVENT_CM) s.hits++; else if (ob >= EVENT_CM) s.misses++; else if (fc >= EVENT_CM) s.falseAlarms++;
}
const finish = (s) => ({ n: s.n, mae: s.n ? +(s.absErr / s.n).toFixed(2) : null, bias: s.n ? +(s.err / s.n).toFixed(2) : null,
  pod: s.hits + s.misses ? +(s.hits / (s.hits + s.misses)).toFixed(2) : null, far: s.hits + s.falseAlarms ? +(s.falseAlarms / (s.hits + s.falseAlarms)).toFixed(2) : null });

async function score(pairs, obs) {
  await mkdir(f("forecasts/"), { recursive: true });
  const files = (await readdir(f("forecasts/"))).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
  const byLead = {}, byResort = {}, recent = {}, skillG = {}, skillR = {}, totals = {};
  for (const file of files) {
    const issue = file.slice(0, 10);
    if (issue < addDays(TODAY, -KEEP_DAYS)) { await rm(f(`forecasts/${file}`)); continue; }
    const snap = await readJSON(`forecasts/${file}`);
    for (const [id, days] of Object.entries(snap?.resorts || {})) {
      const o = obs[pairs[id]?.triplet]; if (!o) continue;
      for (const [d, v] of Object.entries(days)) {
        const lead = Math.round((Date.parse(d) - Date.parse(issue)) / 864e5);
        if (lead < 1 || lead > MAX_LEAD || o[d] == null) continue;
        const L = ((byLead.blend ||= {})[lead] ||= blank()); add(L, v.blend, o[d]);
        for (const [m, x] of Object.entries(v.models || {})) {
          add(((byLead[m] ||= {})[lead] ||= blank()), x, o[d]);
          // Skill for blend weighting: short range (days 1–2), where weights matter most.
          if (lead <= 2) { add((skillG[m] ||= blank()), x, o[d]); add(((skillR[id] ||= {})[m] ||= blank()), x, o[d]); }
        }
        if (lead <= 2) { const t = (totals[id] ||= { n: 0, raw: 0, obs: 0 }); t.n++; t.raw += v.raw ?? v.blend; t.obs += o[d]; }
        if (lead === 1) {
          add((byResort[id] ||= blank()), v.blend, o[d]);
          if (d >= addDays(TODAY, -14)) (recent[id] ||= []).push({ date: d, forecast: v.blend, observed: +o[d].toFixed(1) });
        }
      }
    }
  }
  const map = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, finish(v)]));
  const out = {
    updated: new Date().toISOString(),
    method: `Daily snowfall forecast at each SNOTEL station's elevation vs observed depth gain (cm). Lead = days after issue. Events: ≥${EVENT_CM} cm. POD = share of observed events forecast; FAR = share of forecast events that did not happen.`,
    forecastDays: files.length, labels: MODEL_LABEL, stations: pairs,
    byLead: Object.fromEntries(Object.entries(byLead).map(([m, v]) => [m, map(v)])),
    byResort: map(byResort), recent,
    correction: corrections(totals),
    skill: { leads: [1, 2], global: map(skillG), byResort: Object.fromEntries(Object.entries(skillR).map(([k, v]) => [k, map(v)])) },
  };
  await writeJSON("verification.json", out);
  console.log(`verification: ${files.length} forecast days, lead-1 blend n=${out.byLead.blend?.[1]?.n ?? 0}`);
}

// Per-resort snowfall bias correction from days 1–2. Observed depth gain
// undercounts snowfall (settling), so observations are scaled up by UNDERCOUNT
// before comparing. Shrunk toward 1 until there is plenty of data, and capped.
export const CORRECTION = { minN: 20, minSnow: 20, undercount: 1.15, shrink: 40, min: 0.75, max: 1.3 };
export function corrections(totals) {
  const out = {};
  for (const [id, t] of Object.entries(totals)) {
    if (t.n < CORRECTION.minN || t.raw < CORRECTION.minSnow) continue;
    const ratio = (t.obs * CORRECTION.undercount) / t.raw;
    const factor = Math.min(CORRECTION.max, Math.max(CORRECTION.min, 1 + (ratio - 1) * (t.n / (t.n + CORRECTION.shrink))));
    out[id] = { n: t.n, ratio: +ratio.toFixed(2), factor: +factor.toFixed(2) };
  }
  return out;
}

// VERIFY_NO_MAIN=1 lets tests import the helpers without running the job.
if (process.env.VERIFY_NO_MAIN !== "1") {
const pairs = await stations();
console.log(`${Object.keys(pairs).length} resorts paired with SNOTEL stations`);
await snapshot(pairs);
try { await score(pairs, await observations(pairs)); } catch (e) { console.warn(`scoring skipped: ${e.message}`); }
}
