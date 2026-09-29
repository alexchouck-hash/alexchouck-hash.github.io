import { RESORTS, WEBCAMS } from "./resorts.js";
import { SURFACES, DIFFICULTY, MODEL_LABEL, simulateSegments, skillWeights, biasFactor, dailySnow, days, confidence, snowLine, virtualRuns, compass } from "./model.js";
import { snowRange, snowQuality, windHolds, LIFT_TYPES } from "./ops.js";
import { CATEGORIES, crowd, topRuns, webcamLinks } from "./picks.js";
import * as api from "./api.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = Object.fromEntries(RESORTS.map((r) => [r.id, r]));
const state = { id: "breckenridge", day: null, tod: "am", units: "metric", sort: "score", filter: "all", sel: null, cat: "all" };
const cache = {};
let map, layer, markers = {}, snow7 = {};

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
async function load(id, quiet) {
  const r = byId[id], c = (cache[id] ||= {});
  if (c.ready || c.loading) return c.loading;
  if (!quiet) status("Loading multi-model forecast and trail map…");
  c.loading = (async () => {
    const runsP = api.mapData(r);
    const v = await getVerif();
    c.skill = skillWeights(v?.skill, r.id);
    c.corr = v?.correction?.[r.id] || null;
    c.climateP = api.climate(r.id).catch(() => null);
    const [fc, runs] = await Promise.allSettled([api.forecast(r, 30, c.skill.weights, biasFactor(v?.correction, r.id)), runsP]);
    if (fc.status === "rejected") throw fc.reason;
    c.h = fc.value;
    c.runsErr = runs.status === "rejected" || !runs.value.runs.length;
    c.runs = c.runsErr ? virtualRuns(r) : runs.value.runs;
    c.lifts = runs.status === "fulfilled" ? runs.value.lifts : [];
    c.sim = c.runs.map((run) => { const seg = simulateSegments(run, r, c.h); return { run, seg, byDay: seg.mid }; });
    c.days = days(c.h);
    c.snow = { base: dailySnow(c.h, r.base), mid: dailySnow(c.h, (r.base + r.summit) / 2), summit: dailySnow(c.h, r.summit) };
    c.quality = snowQuality(c.h, r.summit);
    c.holds = c.lifts.map((l) => ({ lift: l, days: windHolds(l, c.h) }));
    c.ready = true;
  })();
  try { await c.loading; if (!quiet) status(""); } catch (e) { c.loading = null; if (!quiet) status(`Could not load forecast: ${e.message}`, true); }
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
    ${c.corr ? `<div class="muted small">Snowfall bias-corrected ×${c.corr.factor} for ${esc(r.name)} (learned from ${c.corr.n} verified days at its SNOTEL station).</div>` : ""}
    <div class="kpis">
      <div class="kpi" id="season-kpi" hidden></div>
      <div class="kpi"><b>${open.length ? avg : "–"}</b><span>Avg run score (${state.tod === "am" ? "morning" : "afternoon"})</span></div>
      <div class="kpi"><b>${open.length}/${scored.length}</b><span>Runs with enough snow</span></div>
      <div class="kpi"><b>${cm(fell)}</b><span>Summit snow, last 3 days</span></div>
      <div class="kpi"><b>${m(sl)}</b><span>Snow line at noon</span></div>
      <div class="kpi"><b class="conf-${conf.level}">${conf.level}</b><span>Confidence (3-day summit snow)</span></div>
    </div>
    <p class="small webcams"><b>Webcams:</b> ${webcamLinks(r.name, r.lat, r.lon, "ski resort", WEBCAMS[r.id]).map((w) => `<a href="${esc(w.url)}" target="_blank" rel="noopener">${w.label}</a>`).join(" · ")}</p>
    ${best.length ? `<p class="small"><b>Best bets:</b> ${best.map((x) => `${esc(x.run.name)} (${SURFACES[x.st.surface].label.toLowerCase()}, ${x.st.score})`).join("; ")}</p>` : ""}
    ${storm3(c, keys)}
    <p class="small muted">${modelTotals ? `Model totals, next 3 days at summit: ${modelTotals}` : ""}</p>
    <div class="scroll"><table>
      <thead><tr><th>Day</th><th class="num">Summit</th><th class="num" title="Low and high end of the forecast range (10th–90th percentile)">Range</th><th class="num">Mid</th><th class="num">Base</th><th></th><th class="num" title="Chance of 15 cm (6 in) or more at the summit">Powder chance</th><th>Snow type</th><th class="num">Temp (summit)</th><th class="num">Wind max</th></tr></thead>
      <tbody>${upcoming.map((k) => {
        const s = c.snow.summit[k], mi = c.snow.mid[k], b = c.snow.base[k];
        const rain = b.rain > 1 ? ` <span class="muted">+${us() ? (b.rain / 25.4).toFixed(2) + "″" : b.rain.toFixed(0) + " mm"} rain at base</span>` : "";
        const rg = snowRange(s), q = c.quality[k];
        return `<tr data-day="${k}" class="${k === d ? "sel" : ""}"><td>${k === todayAt(c.h) ? "Today" : dayLabel(k)}</td><td class="num">${cm(s.snow)}</td><td class="num muted">${rg && rg.p90 >= 1 ? `${cm(rg.p10)}–${cm(rg.p90)}` : "–"}</td><td class="num">${cm(mi.snow)}</td><td class="num">${cm(b.snow)}${rain}</td>
          <td><span class="bar" style="width:${Math.round((s.snow / maxS) * 80)}px"></span></td><td class="num">${rg && rg.p90 >= 5 ? rg.chance + "%" : "–"}</td><td class="small" title="${esc(q?.desc || "")}">${q && q.snow >= 2 ? esc(q.label) : ""}</td><td class="num">${deg(s.Tmin)} / ${deg(s.Tmax)}</td><td class="num">${kmh(s.windMax)}</td></tr>`;
      }).join("")}</tbody>
    </table></div>
  </div>`;
  c.climateP?.then((cl) => {
    const el = document.getElementById("season-kpi"), se = cl?.season;
    if (!el || !se?.through) return;
    el.hidden = false;
    el.innerHTML = `<b>${se.pctOfNormal != null ? se.pctOfNormal + "%" : cm(se.toDate)}</b><span>${se.pctOfNormal != null ? `of normal season snow to date (${cm(se.toDate)} vs ${cm(se.normalToDate)})` : "season snow to date"}${cl.thisWeek ? `; typical this week ${cm(cl.thisWeek.normal)}` : ""}</span>`;
    el.title = "From 10 years of ERA5 reanalysis at summit elevation. Best read as a relative comparison.";
  });
  document.querySelectorAll("#summary tr[data-day]").forEach((tr) => tr.onclick = () => { state.day = tr.dataset.day; $("#day").value = state.day; update(); });
}

// Crowd for a loaded resort on a day, using mid-mountain new snow.
const crowdFor = (r, c, d) => crowd(r, d, c.snow.mid[d]?.snow || 0);
const catButtons = (sel, attr) => Object.entries(CATEGORIES).map(([k, v]) => `<button ${attr}="${k}" class="${sel === k ? "on" : ""}">${v.label}</button>`).join("");
const pickRow = (x, extra = "") => {
  const df = DIFFICULTY[x.run.difficulty] || DIFFICULTY.intermediate;
  return `<tr ${extra}><td><span style="color:${df.color}" title="${df.label}">${df.sym}</span> ${esc(x.run.name)}${x.run.groomed ? ' <span class="muted small" title="Groomed overnight">≡</span>' : ""}</td><td class="num score">${x.pick}</td><td>${pill(x.st.surface)}</td><td class="num">${cm(x.rd.snow24)}</td><td class="num">${deg(x.st.T)}</td></tr>`;
};

// Top runs at this resort for the selected day, by terrain category and crowd.
function picksCard(r, c) {
  const d = state.day, cr = crowdFor(r, c, d);
  const rows = topRuns(c.sim, d, state.tod, state.cat, cr, 6);
  $("#picks").innerHTML = `<div class="card">
    <h3>Top runs, ${state.tod === "am" ? "morning" : "afternoon"} of ${dayLabel(d)}</h3>
    <p class="small">Expected crowd: <b class="crowd-${cr.level.toLowerCase()}">${cr.level}</b>${cr.reasons.length ? ` <span class="muted">(${esc(cr.reasons.join(", "))})</span>` : ""}. Pick a different day above to plan ahead.</p>
    <div class="filters">${catButtons(state.cat, "data-cat")}</div>
    ${rows.length ? `<div class="scroll"><table><thead><tr><th>Run</th><th class="num" title="Snow surface score adjusted for terrain type and expected crowd">Pick</th><th>Surface</th><th class="num">New snow</th><th class="num">Temp</th></tr></thead>
      <tbody>${rows.map((x) => pickRow(x, `data-id="${esc(x.run.id)}"`)).join("")}</tbody></table></div>` : `<p class="small muted">No open ${esc(CATEGORIES[state.cat].label.toLowerCase())} runs match on this day.</p>`}
    ${state.cat === "offpiste" ? `<p class="small muted">Off-piste picks rate snow quality only. Read the local avalanche forecast and go with proper gear and partners.</p>` : ""}
  </div>`;
  document.querySelectorAll("#picks [data-cat]").forEach((b) => b.onclick = () => { state.cat = b.dataset.cat; picksCard(r, c); });
  document.querySelectorAll("#picks tr[data-id]").forEach((tr) => tr.onclick = () => { state.sel = tr.dataset.id; runsTable(c); timeline(c); drawMap(r, c, true); });
}

// Top runs across resorts: scans the snowiest resorts (or a region) for a date.
const finder = { cat: "all", day: null, scope: "snowiest", tod: "am" };
function finderForm() {
  const today = new Date().toISOString().slice(0, 10);
  const dates = Array.from({ length: 9 }, (_, k) => new Date(Date.parse(today) + k * 864e5).toISOString().slice(0, 10));
  finder.day ||= dates[0];
  const regions = [...new Set(RESORTS.map((r) => r.region))];
  $("#finder").innerHTML = `<p class="small muted">Ranks runs by forecast snow surface, terrain type and modeled crowds (weekends, school holidays, powder days). Scans up to 8 resorts, so it takes a moment.</p>
    <div class="finder-controls">
      <label>Date <select id="f-day">${dates.map((d) => `<option value="${d}" ${d === finder.day ? "selected" : ""}>${d === today ? "Today" : dayLabel(d)}</option>`).join("")}</select></label>
      <label>Time <select id="f-tod"><option value="am">Morning</option><option value="pm" ${finder.tod === "pm" ? "selected" : ""}>Afternoon</option></select></label>
      <label>Where <select id="f-scope"><option value="snowiest">Snowiest resorts worldwide</option>${regions.map((g) => `<option value="${esc(g)}" ${finder.scope === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
    </div>
    <div class="filters">${catButtons(finder.cat, "data-fcat")}</div>
    <button id="f-go" class="go">Find top runs</button>
    <div id="f-out"></div>`;
  $("#f-scope").value = finder.scope;
  $("#f-day").onchange = (e) => finder.day = e.target.value;
  $("#f-tod").onchange = (e) => finder.tod = e.target.value;
  $("#f-scope").onchange = (e) => finder.scope = e.target.value;
  document.querySelectorAll("#finder [data-fcat]").forEach((b) => b.onclick = () => { finder.cat = b.dataset.fcat; document.querySelectorAll("#finder [data-fcat]").forEach((x) => x.classList.toggle("on", x === b)); });
  $("#f-go").onclick = findTopRuns;
}
async function findTopRuns() {
  const out = $("#f-out"), { day, tod, cat, scope } = finder;
  out.innerHTML = `<p class="small muted">Picking resorts…</p>`;
  let pool = scope === "snowiest" ? RESORTS : RESORTS.filter((r) => r.region === scope);
  if (pool.length > 8) {
    try {
      const lb = await api.leaderboard(RESORTS), snow = Object.fromEntries(lb.map((x) => [x.id, x.snow.reduce((a, v, k) => a + (x.days[k] <= day ? v || 0 : 0), 0)]));
      pool = [...pool].sort((a, b) => (snow[b.id] || 0) - (snow[a.id] || 0));
    } catch {}
    pool = pool.slice(0, 8);
  }
  const results = [];
  let done = 0;
  const work = pool.map((r) => async () => {
    try { await load(r.id, true); } catch {}
    const c = cache[r.id];
    if (c?.ready && c.days.includes(day)) {
      const cr = crowdFor(r, c, day);
      for (const x of topRuns(c.sim, day, tod, cat, cr, 4)) if (!x.run.virtual) results.push({ ...x, r, cr });
    }
    out.innerHTML = `<p class="small muted">Scanned ${++done} of ${pool.length} resorts…</p>`;
  });
  for (let k = 0; k < work.length; k += 2) await Promise.all(work.slice(k, k + 2).map((f) => f()));
  results.sort((a, b) => b.pick - a.pick);
  const top = results.slice(0, 15);
  out.innerHTML = top.length ? `<div class="scroll"><table><thead><tr><th>Run</th><th>Resort</th><th class="num">Pick</th><th>Surface</th><th class="num">New snow</th><th>Crowd</th></tr></thead><tbody>${
    top.map((x) => { const df = DIFFICULTY[x.run.difficulty] || DIFFICULTY.intermediate; return `<tr data-r="${x.r.id}" data-id="${esc(x.run.id)}"><td><span style="color:${df.color}">${df.sym}</span> ${esc(x.run.name)}</td><td class="small">${esc(x.r.name)}</td><td class="num score">${x.pick}</td><td>${pill(x.st.surface)}</td><td class="num">${cm(x.rd.snow24)}</td><td class="small crowd-${x.cr.level.toLowerCase()}">${x.cr.level}</td></tr>`; }).join("")}</tbody></table></div>`
    : `<p class="small muted">No open runs found for that date and terrain. Resorts may be out of season.</p>`;
  document.querySelectorAll("#f-out tr[data-r]").forEach((tr) => tr.onclick = async () => { state.day = day; state.tod = tod; $("#tod").value = tod; state.cat = cat; await select(tr.dataset.r); state.sel = tr.dataset.id; const c = cache[state.id]; if (c?.ready) { runsTable(c); timeline(c); drawMap(byId[state.id], c, true); } });
}

// Next-3-day summit total as a range, from the per-day model spread.
function storm3(c, keys) {
  const sum = { snow: 0, perModel: {} };
  for (const k of keys) { const s = c.snow.summit[k]; if (!s) continue; sum.snow += s.snow; for (const [m, v] of Object.entries(s.perModel)) sum.perModel[m] = (sum.perModel[m] || 0) + v; }
  const rg = snowRange(sum, 30);
  if (!rg || rg.p90 < 2) return "";
  return `<p class="small"><b>Next 3 days at the summit:</b> ${cm(rg.p50)} expected, range ${cm(rg.p10)} to ${cm(rg.p90)}. Chance of 30 cm (12″) or more: ${rg.chance}%.</p>`;
}

// Wind-hold risk for every lift on the selected day.
function liftsCard(c) {
  const el = $("#lifts");
  if (!c.holds?.length) { el.innerHTML = ""; return; }
  const d = state.day, RISK = { likely: ["Likely wind hold", "#c4553f"], possible: ["Possible holds", "#c9a93a"], low: ["Low", "#2fa36b"] };
  const rows = c.holds.map((x) => ({ l: x.lift, h: x.days[d] })).filter((x) => x.h).sort((a, b) => b.h.maxGust - a.h.maxGust);
  el.innerHTML = `<details class="card" ${rows.some((x) => x.h.risk !== "low") ? "open" : ""}><summary><h3>Lifts: wind-hold risk, ${dayLabel(d)}</h3></summary>
    <p class="small muted">Gusts at each lift's top station during operating hours, compared with typical wind limits for the lift type. Operators decide actual holds.</p>
    <div class="scroll"><table><thead><tr><th>Lift</th><th>Type</th><th class="num">Top</th><th class="num">Peak gust</th><th>Risk</th></tr></thead><tbody>
    ${rows.map(({ l, h }) => `<tr><td>${esc(l.name)}</td><td class="small">${LIFT_TYPES[l.type]?.label || l.type}</td><td class="num">${m(l.top)}</td><td class="num">${kmh(h.maxGust)}</td><td><span class="pill" style="background:${RISK[h.risk][1]}">${RISK[h.risk][0]}</span></td></tr>`).join("")}
    </tbody></table></div></details>`;
}

// Hour-by-hour surface on the selected run, at its top, middle and bottom.
function timeline(c) {
  const el = $("#timeline"), s = c.sim.find((x) => x.run.id === state.sel);
  if (!s) { el.innerHTML = ""; return; }
  const hrs = c.h.time.map((t, i) => [t, i]).filter(([t]) => t.startsWith(state.day) && +t.slice(11, 13) >= 7 && +t.slice(11, 13) <= 17);
  const row = (k, label) => `<tr><th class="small">${label}</th>${hrs.map(([, i]) => { const st = s.seg.hourly?.[k]?.[i]; return st ? `<td title="${SURFACES[st.surface].label}, ${deg(st.T)}" style="background:${SURFACES[st.surface].color};border:2px solid var(--card);min-width:26px"></td>` : "<td></td>"; }).join("")}</tr>`;
  el.innerHTML = `<div class="card"><h3>${esc(s.run.name)}: hour by hour, ${dayLabel(state.day)}</h3>
    <div class="scroll"><table class="tl"><thead><tr><th></th>${hrs.map(([t]) => `<th class="small">${+t.slice(11, 13) % 12 || 12}${+t.slice(11, 13) < 12 ? "a" : "p"}</th>`).join("")}</tr></thead>
    <tbody>${row("top", "Top")}${row("mid", "Middle")}${row("bottom", "Bottom")}</tbody></table></div>
    <p class="small muted">Hover a cell for the surface and temperature. Colors match the map legend.</p></div>`;
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
  document.querySelectorAll("#runs tr[data-id]").forEach((tr) => tr.onclick = () => { state.sel = tr.dataset.id; runsTable(c); timeline(c); drawMap(byId[state.id], c, true); });
}

// ---------- overview map ----------
// Framed on the Rockies; every resort is a clickable dot colored by 7-day summit snow.
// Zoom in (or pick a resort from search) to see its runs colored by snow surface.
const SNOW_LEVELS = [[0, "#b8c2cc", "None", "None"], [1, "#9ec5f0", "Under 5 cm", "Under 2″"], [5, "#4a90e2", "5–15 cm", "2–6″"], [15, "#1f5fc4", "15–30 cm", "6–12″"], [30, "#7b3fc4", "30+ cm", "12+″"]];
const snowColor = (v) => (v == null ? "#b8c2cc" : [...SNOW_LEVELS].reverse().find(([t]) => v >= t)[1]);
function setupMap() {
  map = L.map("map", { zoomControl: true, preferCanvas: true }).fitBounds([[34, -121], [52, -102]]);
  L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap contributors, SRTM · © OpenTopoMap" }).addTo(map);
  for (const r of RESORTS) {
    markers[r.id] = L.circleMarker([r.lat, r.lon], { radius: 7, weight: 1.5, color: "#fff", fillOpacity: 0.95 })
      .addTo(map).on("click", () => select(r.id, false));
  }
  paintMarkers();
  api.leaderboard(RESORTS).then((rows) => {
    for (const x of rows) snow7[x.id] = x.snow.reduce((a, v) => a + (v || 0), 0);
    paintMarkers();
  }).catch(() => {});
}
function paintMarkers() {
  $("#mlegend").innerHTML = `<b>Resorts, next 7 days of summit snow:</b> ` + SNOW_LEVELS.map(([, c, lm, lu]) => `<span><i class="sw dot" style="background:${c}"></i>${us() ? lu : lm}</span>`).join("");
  for (const r of RESORTS) {
    const on = r.id === state.id, v = snow7[r.id];
    markers[r.id].setStyle({ fillColor: snowColor(v), color: on ? "#111" : "#fff", weight: on ? 3 : 1.5 }).setRadius(on ? 10 : 7)
      .bindTooltip(`<b>${esc(r.name)}</b><br>${esc(r.region)}, ${esc(r.country)}${v != null ? `<br>${cm(v)} next 7 days` : ""}`);
    if (on) markers[r.id].bringToFront();
  }
}

// ---------- current conditions ----------
const WMO = {
  0: ["Clear", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"], 45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"], 56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"], 61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"], 71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "🌨️"], 80: ["Showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "❄️"], 95: ["Thunderstorms", "⛈️"], 96: ["Thunderstorms w/ hail", "⛈️"], 99: ["Severe thunderstorms", "⛈️"],
};
const stat = (k, v, d = "") => `<div class="stat"><div class="k">${k}</div><div class="v">${v ?? "–"}</div><div class="d">${d}</div></div>`;
const nowCache = {};
async function renderNow(r) {
  const el = $("#now");
  const hit = nowCache[r.id];
  if (!hit || Date.now() - hit.t > 10 * 60000) {
    if (!hit) el.innerHTML = `<h3>Current conditions</h3><p class="muted small">Loading live conditions at ${esc(r.name)}…</p>`;
    try { nowCache[r.id] = { t: Date.now(), v: await api.current(r) }; }
    catch (e) { if (state.id === r.id && !hit) el.innerHTML = `<h3>Current conditions</h3><p class="muted small">Live data unavailable: ${esc(e.message)}</p>`; return; }
  }
  if (state.id !== r.id) return;
  const { base: b, summit: s } = nowCache[r.id].v;
  const [desc, icon] = WMO[s.weather_code] || ["", ""];
  const depth = s.snow_depth != null ? s.snow_depth * 100 : null;
  el.innerHTML = `<h3>Current conditions at ${esc(r.name)}</h3> <span class="muted small">· updated ${esc(s.time.replace("T", " "))} local · refreshes every 10 min</span>
    <div class="row"><span class="big">${icon} ${deg(s.temperature_2m)}</span><span>${esc(desc)} at the summit · feels ${deg(s.apparent_temperature)} · base ${deg(b.temperature_2m)}</span></div>
    <div class="grid">
      ${stat("Summit wind", kmh(s.wind_speed_10m), `${compass(s.wind_direction_10m)}, gusts ${kmh(s.wind_gusts_10m)}`)}
      ${stat("Snowing now", s.snowfall > 0 ? cm(s.snowfall) : "No", s.snowfall > 0 ? "last hour, summit" : b.precipitation > 0 ? "rain at base" : "dry last hour")}
      ${stat("Snow depth", depth != null ? cm(depth) : "–", "modeled, summit")}
      ${stat("Cloud cover", `${s.cloud_cover}%`, `humidity ${s.relative_humidity_2m}%`)}
      ${stat("Base", `${deg(b.temperature_2m)}`, `wind ${kmh(b.wind_speed_10m)} · ${m(r.base)}`)}
    </div>`;
}
setInterval(() => renderNow(byId[state.id]), 10 * 60000);

// ---------- search ----------
const TOP_PICKS = ["breckenridge", "vail", "aspen-snowmass", "jackson-hole", "park-city", "alta", "big-sky", "whistler"];
function setupSearch() {
  const q = $("#search"), box = $("#searchlist");
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hay = new Map(RESORTS.map((r) => [r.id, norm(`${r.name} ${r.region} ${r.country}`)]));
  const regions = [...new Set(RESORTS.map((r) => r.region))];
  let items = [], active = -1;
  const opt = (r) => `<li role="option" id="so-${r.id}" data-id="${r.id}">${esc(r.name)}<span>${esc(r.region)}, ${esc(r.country)}</span></li>`;
  const group = (name, rs) => `<li class="grp" role="presentation">${esc(name)}</li>` + rs.map(opt).join("");
  function draw() {
    const v = norm(q.value.trim());
    if (!v) box.innerHTML = group("★ Top picks", TOP_PICKS.filter((id) => byId[id]).map((id) => byId[id])) + regions.map((g) => group(g, RESORTS.filter((r) => r.region === g))).join("");
    else {
      const words = v.split(/\s+/);
      const hits = RESORTS.filter((r) => words.every((w) => hay.get(r.id).includes(w)))
        .map((r) => [r, norm(r.name).startsWith(v) ? 0 : norm(r.region).startsWith(v) ? 1 : 2]).sort((a, b) => a[1] - b[1]).map(([r]) => r).slice(0, 50);
      box.innerHTML = hits.length ? hits.map(opt).join("") : `<li class="grp" role="presentation">No matches</li>`;
    }
    items = [...box.querySelectorAll("[data-id]")]; active = -1;
    box.hidden = false; q.setAttribute("aria-expanded", "true");
  }
  const close = () => { box.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); };
  const pick = (id) => { q.value = ""; close(); q.blur(); select(id, true); };
  const move = (d) => {
    if (!items.length) return;
    items[active]?.classList.remove("on");
    active = (active + d + items.length) % items.length;
    items[active].classList.add("on"); items[active].scrollIntoView({ block: "nearest" });
    q.setAttribute("aria-activedescendant", items[active].id);
  };
  q.placeholder = `Search ${RESORTS.length} resorts…`;
  q.onfocus = q.oninput = draw;
  q.onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); box.hidden ? draw() : move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); const it = items[active] || items[0]; if (it) pick(it.dataset.id); }
    else if (e.key === "Escape") close();
  };
  box.onmousedown = (e) => { e.preventDefault(); const it = e.target.closest("[data-id]"); if (it) pick(it.dataset.id); };
  q.onblur = close;
}

// ---------- trail map ----------
function drawMap(r, c, focus) {
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
        .on("click", () => { state.sel = s.run.id; runsTable(c); timeline(c); drawMap(r, c); });
      pl.addTo(layer); lines.push(pl);
      if (selected && focus) map.fitBounds(pl.getBounds(), { maxZoom: 15, padding: [40, 40] });
    }
  }
  for (const l of c?.lifts || []) L.polyline(l.line, { color: "#222", weight: 2, dashArray: "4 4", opacity: 0.8 }).bindTooltip(`${esc(l.name)} (${LIFT_TYPES[l.type]?.label || l.type})`).addTo(layer);
  // Only jump to the resort's trails when asked (search, dropdown, board); a map click keeps the view.
  if (!focus && state.pan) {
    if (lines.length) map.fitBounds(L.featureGroup(lines).getBounds(), { padding: [20, 20] });
    else if (!c) map.setView([r.lat, r.lon], 13);
    if (c) state.pan = false;
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

// Sponsor slot: direct-sold sponsors from sponsors.json, targeted by resort or
// region; falls back to a house ad for advertisers.
let sponsorsP;
async function sponsor(r) {
  sponsorsP ||= fetch("sponsors.json").then((x) => (x.ok ? x.json() : [])).catch(() => []);
  const list = (await sponsorsP).filter((s) => s.active !== false && (!s.resorts || s.resorts.includes(r.id)) && (!s.regions || s.regions.includes(r.region)));
  const s = list.length ? list[Math.floor(Math.random() * list.length)] : null;
  $("#sponsor").innerHTML = s
    ? `<a class="card sponsor" href="${esc(s.url)}" target="_blank" rel="sponsored noopener">${s.image ? `<img src="${esc(s.image)}" alt="">` : ""}<span><span class="tag">Sponsored</span><b>${esc(s.name)}</b><br><span class="small">${esc(s.text)}</span></span></a>`
    : `<a class="card sponsor house" href="for-resorts.html#advertise"><span><span class="tag">Advertise</span><b>Reach skiers when they're planning a day on the mountain.</b><br><span class="small">Sponsor ${esc(r.name)} or a whole region on Bluebird Snow.</span></span></a>`;
}

function update() {
  const r = byId[state.id], c = cache[state.id];
  writeHash(); paintMarkers();
  if (!c?.ready) { drawMap(r, null); $("#summary").innerHTML = ""; $("#picks").innerHTML = ""; $("#runs").innerHTML = ""; return; }
  fillDays(c); writeHash();
  summary(r, c); picksCard(r, c); timeline(c); runsTable(c); liftsCard(c); drawMap(r, c); accuracy(r); sponsor(r);
}
async function select(id, pan = true) {
  state.id = id; state.sel = null; state.pan = pan; $("#resort").value = id;
  update(); renderNow(byId[id]);
  await load(id);
  if (state.id === id) update();
}

readHash();
fillControls();
$("#resort").onchange = (e) => select(e.target.value);
$("#day").onchange = (e) => { state.day = e.target.value; update(); };
$("#tod").onchange = (e) => { state.tod = e.target.value; update(); };
$("#units").onchange = (e) => { state.units = e.target.value; update(); renderNow(byId[state.id]); if ($("#board").querySelector("table")) leaderboard(); };
$("#board-wrap").addEventListener("toggle", (e) => { if (e.target.open && !$("#board").querySelector("table")) leaderboard(); });
finderForm();
setupMap();
setupSearch();
select(state.id, false);
