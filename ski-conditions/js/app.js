import { RESORTS } from "./resorts.js";
import { SURFACES, DIFFICULTY, MODEL_LABEL, simulateSegments, skillWeights, dailySnow, days, confidence, snowLine, virtualRuns, compass } from "./model.js";
import * as api from "./api.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = Object.fromEntries(RESORTS.map((r) => [r.id, r]));
const state = { id: [5, 6, 7, 8, 9].includes(new Date().getMonth()) ? "portillo" : "whistler", day: null, tod: "am", units: "metric", sort: "score", filter: "all", sel: null };
const cache = {};
let map, layer;

// ---------- units ----------
const us = () => state.units === "us";
const cm = (v) => (v == null ? "–" : us() ? `${(v / 2.54).toFixed(v < 25 ? 1 : 0)}″` : `${v.toFixed(v < 10 ? 1 : 0)} cm`);
const deg = (v) => (v == null ? "–" : us() ? `${Math.round(v * 9 / 5 + 32)}°F` : `${Math.round(v)}°C`);
const m = (v) => (v == null ? "–" : us() ? `${Math.round(v * 3.281).toLocaleString()} ft` : `${Math.round(v).toLocaleString()} m`);
const kmh = (v) => (v == null ? "–" : us() ? `${Math.round(v / 1.609)} mph` : `${Math.round(v)} km/h`);
const pill = (s) => `<span class="pill" style="background:${SURFACES[s].color}">${SURFACES[s].label}</span>`;
const dayLabel = (d) => new Date(d + "T12:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// ---------- URL state ----------
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (byId[p.get("r")]) state.id = p.get("r");
  if (p.get("u") === "us" || p.get("u") === "metric") state.units = p.get("u");
  else if (/^en-US/.test(navigator.language)) state.units = "us";
  if (p.get("t") === "pm") state.tod = "pm";
  state.day = p.get("d");
}
const writeHash = () => history.replaceState(null, "", `#r=${state.id}&d=${state.day || ""}&t=${state.tod}&u=${state.units}`);

// ---------- data ----------
async function load(id) {
  const r = byId[id], c = (cache[id] ||= {});
  if (c.ready || c.loading) return c.loading;
  status("Loading multi-model forecast and trail map…");
  c.loading = (async () => {
    const runsP = api.runs(r);
    c.skill = skillWeights((await getVerif())?.skill, r.id);
    const [fc, runs] = await Promise.allSettled([api.forecast(r, 30, c.skill.weights), runsP]);
    if (fc.status === "rejected") throw fc.reason;
    c.h = fc.value;
    c.runsErr = runs.status === "rejected" || !runs.value.length;
    c.runs = c.runsErr ? virtualRuns(r) : runs.value;
    c.sim = c.runs.map((run) => { const seg = simulateSegments(run, r, c.h); return { run, seg, byDay: seg.mid }; });
    c.days = days(c.h);
    c.snow = { base: dailySnow(c.h, r.base), mid: dailySnow(c.h, (r.base + r.summit) / 2), summit: dailySnow(c.h, r.summit) };
    c.ready = true;
  })();
  try { await c.loading; status(""); } catch (e) { c.loading = null; status(`Could not load forecast: ${e.message}`, true); }
  return c.loading;
}
const status = (msg, err) => { const el = $("#status"); el.textContent = msg; el.classList.toggle("err", !!err); };

// Today in the resort's time zone.
function todayAt(h) { return new Date(Date.now() + h.utcOffset * 1000).toISOString().slice(0, 10); }

// ---------- render ----------
function fillControls() {
  const groups = {};
  for (const r of RESORTS) (groups[r.region] ||= []).push(r);
  const sel = $("#resort"); sel.innerHTML = "";
  for (const [g, rs] of Object.entries(groups)) {
    const og = document.createElement("optgroup"); og.label = g;
    rs.forEach((r) => og.append(new Option(`${r.name} (${r.country})`, r.id))); sel.append(og);
  }
  sel.value = state.id; $("#tod").value = state.tod; $("#units").value = state.units;
  $("#legend").innerHTML = Object.entries(SURFACES).map(([, s]) => `<span><i class="sw" style="background:${s.color}"></i>${s.label}</span>`).join("");
}

function fillDays(c) {
  const today = todayAt(c.h);
  const ds = c.days.filter((d) => d >= today);
  if (!ds.includes(state.day)) state.day = ds[0];
  $("#day").innerHTML = ds.map((d) => `<option value="${d}">${d === today ? "Today" : dayLabel(d)}</option>`).join("");
  $("#day").value = state.day;
}

function summary(r, c) {
  const d = state.day, keys = c.days.filter((x) => x >= d).slice(0, 3);
  const conf = confidence(c.snow.summit, keys);
  const noon = c.h.time.findIndex((t) => t.startsWith(d) && t.endsWith("12:00"));
  const sl = noon >= 0 ? snowLine(c.h, noon) : null;
  const scored = c.sim.map((s) => ({ run: s.run, st: s.byDay[d]?.[state.tod] })).filter((x) => x.st);
  const open = scored.filter((x) => x.st.surface !== "closed");
  const avg = open.length ? Math.round(open.reduce((a, x) => a + x.st.score, 0) / open.length) : 0;
  const best = [...open].sort((a, b) => b.st.score - a.st.score || b.st.fresh - a.st.fresh).slice(0, 3);
  const past = c.days.filter((x) => x < todayAt(c.h)).slice(-3);
  const fell = past.reduce((a, k) => a + (c.snow.summit[k]?.snow || 0), 0);
  const upcoming = c.days.filter((x) => x >= todayAt(c.h)).slice(0, 10);
  const maxS = Math.max(1, ...upcoming.map((k) => c.snow.summit[k]?.snow || 0));
  const modelTotals = Object.entries(conf.totals).map(([k, v]) => `${MODEL_LABEL[k]} ${cm(v)}`).join(" · ");

  $("#summary").innerHTML = `
  <div class="card">
    <h2>${esc(r.name)}</h2>
    <div class="muted small">${esc(r.region)}, ${esc(r.country)} · ${m(r.base)} – ${m(r.summit)} · treeline ≈ ${m(r.treeline)} · models: ${c.h.models.map((k) => MODEL_LABEL[k]).join(", ")}</div>
    <div class="muted small">${c.skill?.source ? `Blend weighted by verified skill (${c.skill.source === "resort" ? "this resort's station" : c.skill.source === "global" ? "all SNOTEL stations" : "this resort's station and all stations"}, ≥${c.skill.n} scored days): ${Object.entries(c.skill.weights).sort((a, b) => b[1] - a[1]).map(([k, w]) => `${MODEL_LABEL[k]} ×${w}`).join(" · ")}` : "Equal model weights (high-res regional ×2) until enough forecasts are verified."}</div>
    <div class="kpis">
      <div class="kpi"><b>${open.length ? avg : "–"}</b><span>Avg run score (${state.tod === "am" ? "morning" : "afternoon"})</span></div>
      <div class="kpi"><b>${open.length}/${scored.length}</b><span>Runs with enough snow</span></div>
      <div class="kpi"><b>${cm(fell)}</b><span>Summit snow, last 3 days</span></div>
      <div class="kpi"><b>${m(sl)}</b><span>Snow line at noon</span></div>
      <div class="kpi"><b class="conf-${conf.level}">${conf.level}</b><span>Confidence (3-day summit snow)</span></div>
    </div>
    ${best.length ? `<p class="small"><b>Best bets:</b> ${best.map((x) => `${esc(x.run.name)} (${SURFACES[x.st.surface].label.toLowerCase()}, ${x.st.score})`).join("; ")}</p>` : ""}
    <p class="small muted">${modelTotals ? `Model totals, next 3 days at summit: ${modelTotals}` : ""}</p>
    <div class="scroll"><table>
      <thead><tr><th>Day</th><th class="num">Summit</th><th class="num">Mid</th><th class="num">Base</th><th></th><th class="num">Temp (summit)</th><th class="num">Wind max</th></tr></thead>
      <tbody>${upcoming.map((k) => {
        const s = c.snow.summit[k], mi = c.snow.mid[k], b = c.snow.base[k];
        const rain = b.rain > 1 ? ` <span class="muted">+${us() ? (b.rain / 25.4).toFixed(2) + "″" : b.rain.toFixed(0) + " mm"} rain at base</span>` : "";
        return `<tr data-day="${k}" class="${k === d ? "sel" : ""}"><td>${k === todayAt(c.h) ? "Today" : dayLabel(k)}</td><td class="num">${cm(s.snow)}</td><td class="num">${cm(mi.snow)}</td><td class="num">${cm(b.snow)}${rain}</td>
          <td><span class="bar" style="width:${Math.round((s.snow / maxS) * 80)}px"></span></td><td class="num">${deg(s.Tmin)} / ${deg(s.Tmax)}</td><td class="num">${kmh(s.windMax)}</td></tr>`;
      }).join("")}</tbody>
    </table></div>
  </div>`;
  document.querySelectorAll("#summary tr[data-day]").forEach((tr) => tr.onclick = () => { state.day = tr.dataset.day; $("#day").value = state.day; update(); });
}

// "Top: powder · Bottom: slush" when the ends of a run differ from its middle.
function ends(s, d) {
  const t = s.seg.top[d]?.[state.tod], b = s.seg.bottom[d]?.[state.tod], mid = s.byDay[d]?.[state.tod];
  if (!t || !b || (t.surface === mid?.surface && b.surface === mid?.surface)) return "";
  return `Top: ${SURFACES[t.surface].label.toLowerCase()} · Bottom: ${SURFACES[b.surface].label.toLowerCase()}`;
}

function runsTable(c) {
  const d = state.day;
  let rows = c.sim.map((s) => ({ run: s.run, st: s.byDay[d]?.[state.tod], rd: s.byDay[d], ends: ends(s, d) })).filter((x) => x.st);
  const f = state.filter;
  if (f !== "all") rows = rows.filter((x) => (f === "groomed" ? x.run.groomed : f === "ungroomed" ? !x.run.groomed : f === "easy" ? ["novice", "easy"].includes(x.run.difficulty) : f === "expert" ? ["expert", "freeride", "extreme"].includes(x.run.difficulty) : x.run.difficulty === f));
  const key = { score: (x) => -x.st.score, name: (x) => x.run.name, snow: (x) => -(x.rd.snow24 || 0), top: (x) => -x.run.top, aspect: (x) => x.run.aspect };
  rows.sort((a, b) => { const ka = key[state.sort](a), kb = key[state.sort](b); return ka < kb ? -1 : ka > kb ? 1 : 0; });
  const filters = [["all", "All"], ["easy", "Green"], ["intermediate", "Blue"], ["advanced", "Black"], ["expert", "Expert"], ["groomed", "Groomed"], ["ungroomed", "Ungroomed"]];
  $("#runs").innerHTML = `
  <div class="card">
    <h3>Every run, ${state.tod === "am" ? "morning" : "afternoon"} of ${dayLabel(d)}</h3>
    ${c.runsErr ? `<p class="small muted">No runs are mapped in OpenStreetMap near this resort yet (or the map service is busy), so these are virtual slopes by elevation band and aspect.</p>` : `<p class="small muted">${c.runs.length} runs from OpenStreetMap. Click a run to find it on the map.</p>`}
    <div class="filters">${filters.map(([k, l]) => `<button data-f="${k}" class="${state.filter === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="scroll"><table>
      <thead><tr><th data-sort="name">Run</th><th data-sort="score" class="num">Score</th><th>Surface</th><th data-sort="snow" class="num">New snow</th><th class="num">Depth</th><th class="num">Temp</th><th data-sort="top" class="num">Top–bottom</th><th data-sort="aspect">Faces</th></tr></thead>
      <tbody>${rows.map((x) => {
        const df = DIFFICULTY[x.run.difficulty] || DIFFICULTY.intermediate;
        return `<tr data-id="${esc(x.run.id)}" class="${state.sel === x.run.id ? "sel" : ""}">
          <td><span style="color:${df.color}" title="${df.label}">${df.sym}</span> ${esc(x.run.name)}${x.run.groomed ? ' <span class="muted small" title="Groomed overnight">≡</span>' : ""}</td>
          <td class="num score">${x.st.score}</td><td>${pill(x.st.surface)}${x.ends ? `<div class="small muted">${x.ends}</div>` : ""}</td>
          <td class="num">${cm(x.rd.snow24)}</td><td class="num">${cm(x.st.depth)}</td><td class="num">${deg(x.st.T)}</td>
          <td class="num">${m(x.run.top)}–${m(x.run.bottom)}</td><td>${compass(x.run.aspect)} · ${x.run.slope}°</td></tr>`;
      }).join("")}</tbody>
    </table></div>
  </div>`;
  document.querySelectorAll("#runs [data-f]").forEach((b) => b.onclick = () => { state.filter = b.dataset.f; runsTable(c); });
  document.querySelectorAll("#runs th[data-sort]").forEach((th) => th.onclick = () => { state.sort = th.dataset.sort; runsTable(c); });
  document.querySelectorAll("#runs tr[data-id]").forEach((tr) => tr.onclick = () => { state.sel = tr.dataset.id; runsTable(c); drawMap(byId[state.id], c, true); });
}

function drawMap(r, c, focus) {
  if (!map) {
    map = L.map("map", { zoomControl: true });
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap contributors, SRTM · © OpenTopoMap" }).addTo(map);
  }
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  const lines = [];
  for (const s of c?.sim || []) {
    const st = s.byDay[state.day]?.[state.tod];
    if (!s.run.ways || !st) continue;
    const selected = state.sel === s.run.id;
    for (const w of s.run.ways) {
      const pl = L.polyline(w, { color: SURFACES[st.surface].color, weight: selected ? 7 : 4, opacity: selected ? 1 : 0.85 })
        .bindTooltip(`<b>${esc(s.run.name)}</b><br>${SURFACES[st.surface].label} · score ${st.score}<br>new snow ${cm(s.byDay[state.day].snow24)} · ${deg(st.T)}${ends(s, state.day) ? "<br>" + ends(s, state.day) : ""}`)
        .on("click", () => { state.sel = s.run.id; runsTable(c); drawMap(r, c); });
      pl.addTo(layer); lines.push(pl);
      if (selected && focus) map.fitBounds(pl.getBounds(), { maxZoom: 15, padding: [40, 40] });
    }
  }
  if (!focus) {
    if (lines.length && !c.fitted) { map.fitBounds(L.featureGroup(lines).getBounds(), { padding: [20, 20] }); c.fitted = true; }
    else if (!lines.length) map.setView([r.lat, r.lon], 13);
  }
}

async function leaderboard() {
  try {
    const rows = await api.leaderboard(RESORTS);
    const tot = rows.map((x) => ({ r: byId[x.id], snow: x.snow.reduce((a, v) => a + (v || 0), 0), next3: x.snow.slice(0, 3).reduce((a, v) => a + (v || 0), 0) })).sort((a, b) => b.snow - a.snow);
    const mx = Math.max(1, tot[0].snow);
    $("#board").innerHTML = `<p class="small muted">Summit snowfall, single blended model. Click a resort to open its run-by-run forecast.</p><div class="scroll"><table><thead><tr><th>Resort</th><th class="num">Next 3 days</th><th class="num">7 days</th><th></th></tr></thead><tbody>${
      tot.map((x) => `<tr data-r="${x.r.id}"><td>${esc(x.r.name)} <span class="muted small">${esc(x.r.country)}</span></td><td class="num">${cm(x.next3)}</td><td class="num">${cm(x.snow)}</td><td><span class="bar" style="width:${Math.round((x.snow / mx) * 100)}px"></span></td></tr>`).join("")}</tbody></table></div>`;
    document.querySelectorAll("#board tr[data-r]").forEach((tr) => tr.onclick = () => select(tr.dataset.r));
  } catch (e) { $("#board").textContent = `Could not load: ${e.message}`; }
}

// Forecast accuracy from the daily SNOTEL verification.
let verifP;
// Verification feed (never blocks the forecast for more than 4 s).
const getVerif = () => (verifP ||= Promise.race([api.verification().catch(() => null), new Promise((res) => setTimeout(() => res(null), 4000))]));
async function accuracy(r) {
  const v = await getVerif(), el = $("#accuracy");
  if (!v?.byLead?.blend) { el.innerHTML = ""; return; }
  const leads = [1, 2, 3, 5].filter((l) => v.byLead.blend[l]);
  const models = Object.keys(v.byLead).sort((a, b) => (a === "blend" ? -1 : b === "blend" ? 1 : (v.byLead[a][1]?.mae ?? 99) - (v.byLead[b][1]?.mae ?? 99)));
  const st = v.stations?.[r.id], mine = v.byResort?.[r.id], rec = v.recent?.[r.id] || [];
  el.innerHTML = `<details class="card"><summary><h3>Forecast accuracy (SNOTEL-verified)</h3></summary>
    <p class="small muted">${v.forecastDays} days of saved forecasts scored against observed snow-depth gain at ${new Set(Object.values(v.stations).map((s) => s.triplet)).size} SNOTEL stations. Lower error is better. Depth gain undercounts real snowfall a little because new snow settles.</p>
    <div class="scroll"><table><thead><tr><th>Model</th>${leads.map((l) => `<th class="num">Day ${l} error</th>`).join("")}<th class="num">Day 1 bias</th><th class="num">Big days caught</th></tr></thead><tbody>
    ${models.map((mo) => { const b = v.byLead[mo]; return `<tr><td>${mo === "blend" ? "<b>Our blend</b>" : esc(v.labels?.[mo] || mo)}</td>${leads.map((l) => `<td class="num">${b[l] ? cm(b[l].mae) : "–"}</td>`).join("")}<td class="num">${b[1] ? (b[1].bias > 0 ? "+" : "") + cm(b[1].bias) : "–"}</td><td class="num">${b[1]?.pod != null ? Math.round(b[1].pod * 100) + "%" : "–"}</td></tr>`; }).join("")}
    </tbody></table></div>
    ${st ? `<p class="small">${esc(r.name)} is checked against <b>${esc(st.name)}</b> SNOTEL (${m(st.elevM)}, ${st.km} km away)${mine?.n ? `: day-1 error ${cm(mine.mae)} over ${mine.n} days` : ""}.</p>
      ${rec.length ? `<p class="small muted">Last 2 weeks, forecast vs observed: ${rec.map((x) => `${dayLabel(x.date)} ${cm(x.forecast)} / ${cm(x.observed)}`).join(" · ")}</p>` : ""}` : `<p class="small muted">No SNOTEL station near ${esc(r.name)} yet; verification covers US resorts for now.</p>`}
  </details>`;
}

function update() {
  const r = byId[state.id], c = cache[state.id];
  writeHash();
  if (!c?.ready) { drawMap(r, null); $("#summary").innerHTML = ""; $("#runs").innerHTML = ""; return; }
  fillDays(c); writeHash();
  summary(r, c); runsTable(c); drawMap(r, c); accuracy(r);
}
async function select(id) {
  state.id = id; state.sel = null; $("#resort").value = id;
  update();
  await load(id);
  if (state.id === id) update();
}

readHash();
fillControls();
$("#resort").onchange = (e) => select(e.target.value);
$("#day").onchange = (e) => { state.day = e.target.value; update(); };
$("#tod").onchange = (e) => { state.tod = e.target.value; update(); };
$("#units").onchange = (e) => { state.units = e.target.value; update(); if ($("#board").querySelector("table")) leaderboard(); };
$("#board-wrap").addEventListener("toggle", (e) => { if (e.target.open && !$("#board").querySelector("table")) leaderboard(); });
select(state.id);
