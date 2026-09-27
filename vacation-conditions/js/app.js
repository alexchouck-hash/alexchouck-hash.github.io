import { DESTINATIONS, AIRPORTS } from "./destinations.js";
import { ACTIVITIES, METRICS, SCORE_LEVELS, CROWD_TYPES, ADVISORY, buildDay, mainActivity } from "./model.js";
import { iso, parseISO, addDays, DAY, level, WMO } from "../../js/model.js";
import * as api from "./api.js";
import { nwsAlerts } from "../../js/api.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
const now = new Date();
const TODAY = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
const MAX = addDays(TODAY, 365);
const state = { activity: "all", id: DESTINATIONS[0]?.id, date: iso(TODAY), tab: "overview", scope: "all" };
const cache = {};
let space = null; // NOAA Kp outlook by date (shared by all destinations)

// ---------- URL state ----------
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (byId[p.get("d")]) state.id = p.get("d");
  if (ACTIVITIES[p.get("a")] || p.get("a") === "all") state.activity = p.get("a");
  const d = p.get("date"); if (d && parseISO(d) >= TODAY && parseISO(d) <= MAX) state.date = d;
  if (p.get("tab")) state.tab = p.get("tab");
}
const writeHash = () => history.replaceState(null, "", `#d=${state.id}&a=${state.activity}&date=${state.date}&tab=${state.tab}`);
const pref = () => (state.activity === "all" ? undefined : state.activity);
const visible = () => DESTINATIONS.filter((d) => state.activity === "all" || d.types.includes(state.activity));

// ---------- data ----------
function day(dest, d) {
  const c = cache[dest.id] || {};
  return buildDay(dest, d, TODAY, { fc: c.fc?.days[iso(d)] || null, live: c.fc?.live, activity: pref(), aq: c.aq?.days, alerts: c.alerts, space });
}
const memo = new Map();
function allFor(d) {
  const k = iso(d) + state.activity + Object.keys(cache).length + (space ? 1 : 0);
  if (!memo.has(k)) { memo.clear(); memo.set(k, new Map(DESTINATIONS.map((x) => [x.id, day(x, d)]))); }
  return memo.get(k);
}
async function load(id, force) {
  const dest = byId[id], c = (cache[id] ||= {});
  if (c.fc && !force) return;
  const [fc, aq, al] = await Promise.allSettled([
    api.forecast(dest.lat, dest.lon), api.airQuality(dest.lat, dest.lon),
    dest.country === "US" ? nwsAlerts(dest.lat, dest.lon) : Promise.resolve(null),
  ]);
  if (fc.status === "fulfilled") { c.fc = fc.value; c.err = null; } else c.err = fc.reason?.message;
  if (aq.status === "fulfilled") c.aq = aq.value;
  if (al.status === "fulfilled") c.alerts = al.value;
  memo.clear();
  if (state.id === id) { render(); paint(); }
}

// ---------- controls ----------
function fillSelect() {
  const sel = $("#dest"); sel.innerHTML = "";
  const list = visible();
  const groups = {};
  for (const d of list) (groups[`${ACTIVITIES[d.types[0]].icon} ${d.area}`] ||= []).push(d);
  for (const [g, ds] of Object.entries(groups).sort()) {
    const og = document.createElement("optgroup"); og.label = g;
    ds.forEach((d) => og.append(new Option(d.name, d.id))); sel.append(og);
  }
  if (!list.some((d) => d.id === state.id)) state.id = list[0]?.id;
  sel.value = state.id;
  $("#destlist").innerHTML = list.map((d) => `<option value="${esc(`${d.name} (${d.area})`)}"></option>`).join("");
  $("#search").placeholder = `Search ${list.length} destinations…`;
}
function setup() {
  $("#activity").innerHTML = `<option value="all">All activities</option>` + Object.entries(ACTIVITIES).map(([k, a]) => `<option value="${k}">${a.icon} ${esc(a.label)}</option>`).join("");
  $("#activity").value = state.activity;
  $("#activity").onchange = (e) => { state.activity = e.target.value; memo.clear(); fillSelect(); select(state.id, false); };
  fillSelect();
  $("#dest").onchange = (e) => select(e.target.value, true);
  $("#search").onchange = (e) => {
    const v = e.target.value.trim().toLowerCase();
    const hit = visible().find((d) => `${d.name} (${d.area})`.toLowerCase() === v) || visible().find((d) => `${d.name} ${d.area}`.toLowerCase().includes(v));
    if (v && hit) { e.target.value = ""; select(hit.id, true); }
  };
  const di = $("#date"); di.min = iso(TODAY); di.max = iso(MAX); di.value = state.date;
  di.onchange = () => di.value && setDate(di.value);
  document.querySelectorAll("[data-jump]").forEach((b) => (b.onclick = () => setDate(iso(addDays(TODAY, +b.dataset.jump)))));
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); }));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-dest]"); if (a) { e.preventDefault(); select(a.dataset.dest, true); }
    const t = e.target.closest("[data-date]"); if (t) setDate(t.dataset.date);
  });
}
function setDate(d) {
  const t = parseISO(d); state.date = iso(t < TODAY ? TODAY : t > MAX ? MAX : t);
  $("#date").value = state.date; render(); paint();
}
function select(id, pan) {
  state.id = id; $("#dest").value = id;
  const d = byId[id]; if (pan && d) map.flyTo([d.lat, d.lon], 8, { duration: 0.8 });
  render(); paint(); load(id);
}

// ---------- map ----------
let map; const markers = {};
function setupMap() {
  map = L.map("map", { preferCanvas: true }).setView([40, -98], 4);
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
  const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri" });
  const lbl = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 });
  const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA)" });
  L.control.layers({ "Street map": osm, "Satellite": L.layerGroup([esri, lbl]), "Terrain": topo }, {}, { collapsed: false }).addTo(map);
  for (const d of DESTINATIONS) markers[d.id] = L.circleMarker([d.lat, d.lon], { radius: 6, weight: 1.5, color: "#fff", fillOpacity: 0.95 }).on("click", () => select(d.id, false));
}
function paint() {
  const all = allFor(parseISO(state.date)), vis = new Set(visible().map((d) => d.id));
  for (const d of DESTINATIONS) {
    const m = markers[d.id];
    if (!vis.has(d.id)) { m.remove(); continue; }
    m.addTo(map);
    const q = all.get(d.id).score, sel = d.id === state.id;
    m.setStyle({ fillColor: q.color, radius: sel ? 11 : 6, weight: sel ? 3 : 1.5, color: sel ? "#14212b" : "#fff" });
    if (sel) m.bringToFront();
    m.bindTooltip(`<b>${esc(d.name)}</b><br>${esc(d.area)}<br>${ACTIVITIES[q.activity].icon} ${q.total}/100 ${q.label}`);
  }
  $("#legend").innerHTML = "Favorability: " + SCORE_LEVELS.map(([, l, c]) => `<span style="--c:${c}">${l}</span>`).join("");
}

// ---------- helpers ----------
const chip = (l, c) => `<span class="chip" style="--c:${c}">${esc(l)}</span>`;
const scoreChip = (q) => chip(`${q.total} · ${q.label}`, q.color);
const stat = (k, v, d = "") => `<div class="stat"><div class="k">${k}</div><div class="v">${v ?? "—"}</div><div class="d">${d}</div></div>`;
const pct = (n) => (n > 0 ? `+${n}%` : `${n}%`);
const fmt = (d, o) => d.toLocaleDateString(undefined, { timeZone: "UTC", ...o });
function dist(a, b, c, d) { const R = 3959, t = Math.PI / 180; const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

// ---------- render ----------
function render() {
  writeHash();
  const dest = byId[state.id]; if (!dest) return;
  const d = parseISO(state.date), rec = day(dest, d), c = cache[dest.id] || {};
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  $("#head").innerHTML = `<h2>${esc(dest.name)}</h2>
    <div class="muted">${esc(dest.area)}, ${esc(dest.country)} · Airports: ${(dest.airports || []).join(", ")}</div>
    <div style="margin-top:6px">${fmt(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      <span class="chip soft">${rec.weather.source === "forecast" ? `Forecast · ${rec.daysOut} days out` : `Typical conditions · ${rec.daysOut} days out`}</span>
      <span class="types">${dest.types.map((t) => `<span class="chip soft">${ACTIVITIES[t].icon} ${ACTIVITIES[t].label}</span>`).join("")}</span>
      ${[...rec.crowds.drivers].map((x) => `<span class="chip soft">${esc(x)}</span>`).join(" ")}</div>`;
  $("#now").innerHTML = nowCard(c) + (rec.alerts?.length ? rec.alerts.slice(0, 3).map((a) => `<div class="alert"><b>${esc(a.event)}</b>: ${esc(a.headline || "")}</div>`).join("") : "");
  $("#tab").innerHTML = (TABS[state.tab] || TABS.overview)(dest, d, rec);
  const rs = $("#scope"); if (rs) rs.onchange = () => { state.scope = rs.value; render(); };
  const dl = $("#tab [data-download]"); if (dl) dl.onclick = () => download(dest, dl.dataset.download);
  year(dest, d);
}

function nowCard(c) {
  const cur = c.fc?.current;
  if (!cur) return `<h3>Current conditions</h3><p class="muted">${c.err ? "Live data unavailable: " + esc(c.err) : "Loading live conditions…"}</p>`;
  const [desc, icon] = WMO[cur.weather_code] || ["", ""];
  return `<h3>Current conditions <span class="muted small">· ${esc(cur.time.replace("T", " "))} local</span></h3>
    <div class="row"><span class="big">${icon} ${Math.round(cur.temperature_2m)}°F</span><span>${esc(desc)} · feels ${Math.round(cur.apparent_temperature)}°F · wind ${Math.round(cur.wind_speed_10m)} mph</span></div>
    ${c.fc.live?.snowDepthIn != null ? `<p class="small muted" style="margin:6px 0 0">Modeled snow depth at this grid point: ${c.fc.live.snowDepthIn}" (valley grids can under-read the mountain; check the resort's snow report).</p>` : ""}`;
}

function scoreCard(rec) {
  const q = rec.score;
  const others = Object.values(rec.scores).filter((x) => x.activity !== q.activity);
  return `<div class="card"><h3>${ACTIVITIES[q.activity].icon} ${ACTIVITIES[q.activity].label} favorability ${scoreChip(q)}</h3>
    ${others.length ? `<p class="small muted" style="margin:0 0 6px">Also: ${others.map((o) => `${ACTIVITIES[o.activity].icon} ${ACTIVITIES[o.activity].label} ${o.total}`).join(" · ")}</p>` : ""}
    <div class="bars">${Object.entries(q.parts).map(([k, v]) => { const col = v == null ? "var(--line)" : level(v, SCORE_LEVELS)[2];
      return `<div class="bar"><span>${METRICS[k]}</span><div class="meter"><i style="width:${v ?? 0}%;--c:${col}"></i></div><b>${v ?? "—"}</b></div>`; }).join("")}</div>
    <p class="small muted" style="margin:6px 0 0">1–100, 100 = best. Each metric is scored separately; the overall score weights them for this activity.</p></div>`;
}

function activityCards(dest, rec) {
  const out = [];
  if (rec.ski) {
    const s = rec.ski, k = dest.ski;
    const next16 = Object.values(cache[dest.id]?.fc?.days || {}).reduce((a, x) => a + (x.snowIn || 0), 0);
    out.push(`<div class="card"><h3>⛷️ Snow & mountain</h3><div class="grid">
      ${stat("Season", s.open ? "Open" : "Closed", `${esc(s.status)} · typically ${k.open} to ${k.close}`)}
      ${stat("Typical base", s.open ? `${s.typicalBaseIn}"` : "—", "For this point in the season")}
      ${stat("New snow", `${s.newSnowIn}"`, rec.weather.source === "forecast" ? "Forecast for the day" : "Typical daily average")}
      ${stat("Next 16 days", cache[dest.id]?.fc ? `${Math.round(next16)}"` : "—", "Forecast snowfall")}
      ${stat("Vertical", `${(k.verticalFt || 0).toLocaleString()} ft`, `${k.trails ?? "—"} trails · ${k.lifts ?? "—"} lifts`)}
      ${stat("Avg snowfall", `${k.avgSnowIn ?? "—"}"`, `Pass: ${esc(k.pass || "—")}`)}
    </div></div>`);
  }
  if (rec.fall) {
    const f = rec.fall;
    out.push(`<div class="card"><h3>🍁 Fall colors</h3><div class="grid">
      ${stat("Status", esc(f.status), f.daysFromPeak === 0 ? "Typical peak day" : `${Math.abs(f.daysFromPeak)} days ${f.daysFromPeak < 0 ? "before" : "after"} typical peak`)}
      ${stat("Color index", `${f.color}/100`, `Typical peak ${fmt(parseISO(f.peakDate), { month: "short", day: "numeric" })}`)}
      ${stat("Trees", "", esc(f.trees || ""))}
    </div><p class="small muted">Peak dates shift about a week with drought, heat and early frost. Check state foliage reports close to your trip.</p></div>`);
  }
  if (rec.bugs) {
    const b = rec.bugs;
    out.push(`<div class="card"><h3>🦟 Bugs: ${esc(b.label)}</h3>${Object.values(b.each).map((x) => {
      const col = x.index >= 70 ? "#c8372d" : x.index >= 45 ? "#e0772b" : x.index >= 20 ? "#e3b52a" : "#2e9e6b";
      return `<div class="bugrow"><span>${esc(x.name)}</span><div class="meter"><i style="width:${x.index}%;--c:${col}"></i></div><b>${esc(x.label)}</b></div>`; }).join("")}
      ${dest.hike ? `<p class="small muted">Best months: ${esc(dest.hike.bestMonths || "—")} · Permits: ${esc(dest.hike.permits || "—")}</p>` : ""}</div>`);
  }
  if (rec.aurora) {
    const a = rec.aurora;
    out.push(`<div class="card"><h3>🌌 Northern lights: ${esc(a.label)}</h3><div class="grid">
      ${stat("Chance that night", `${a.chance}%`, "Activity × clear skies × darkness")}
      ${stat("Kp needed here", a.kpNeeded, a.kpForecast != null ? `Forecast Kp ${a.kpForecast} (${a.source})` : "Typical odds for this month")}
      ${stat("Geomagnetic odds", `${a.activityPct}%`, `Chance of Kp ≥ ${a.kpNeeded}`)}
      ${stat("Dark hours", `${Math.max(0, Math.round((24 - rec.daylightHours) * 10) / 10)} h`, rec.daylightHours >= 21 ? "Midnight sun: no aurora" : "Night length")}
    </div><p class="small muted">Kp forecast from <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener">NOAA SWPC</a> (3-day and 27-day outlooks); later dates use typical odds, which peak near the equinoxes.</p></div>`);
  }
  if (rec.sky) {
    const k = rec.sky;
    out.push(`<div class="card"><h3>🔭 Night sky</h3><div class="grid">
      ${stat("Moon", `${rec.moon.illumination}%`, rec.moon.phase)}
      ${stat("Cloud cover", k.cloud != null ? `${k.cloud}%` : "—", rec.weather.source === "forecast" ? "Forecast" : "Typical night")}
      ${stat("Bortle class", k.bortle, k.bortle <= 2 ? "Pristine dark sky" : k.bortle <= 4 ? "Rural sky" : "Light-polluted")}
      ${stat("Best season", esc(k.season || "—"), esc(k.darkSkyPlace || ""))}
    </div></div>`);
  }
  if (dest.types.some((t) => CROWD_TYPES.includes(t))) {
    const cr = rec.crowds;
    out.push(`<div class="card"><h3>🎢 Crowds</h3><div class="row"><span class="big10">${cr.level}/10</span>${chip(cr.label, cr.color)}</div>
      ${cr.drivers.length ? `<p class="small">Drivers: ${cr.drivers.map(esc).join(", ")}</p>` : ""}
      ${dest.park ? `<p class="small muted">Hours: ${esc(dest.park.hours || "—")} · Tips: ${esc(dest.park.tips || "—")}</p>` : ""}
      ${next14Crowds(dest)}</div>`);
  }
  return out.join("");
}
function next14Crowds(dest) {
  const d0 = parseISO(state.date);
  return `<table><tr><th>Date</th><th>Crowd</th><th>Hotel</th></tr>${Array.from({ length: 14 }, (_, i) => addDays(d0, i)).filter((x) => x <= MAX).map((x) => {
    const q = day(dest, x); return `<tr data-date="${iso(x)}" style="cursor:pointer"><td>${fmt(x, { weekday: "short", month: "short", day: "numeric" })}</td><td>${q.crowds.level}/10 ${chip(q.crowds.label, q.crowds.color)}</td><td>${pct(q.cost.hotel.pct)}</td></tr>`; }).join("")}</table>`;
}

function swaps(dest, d, rec) {
  const all = allFor(d), act = rec.score.activity;
  const radius = CROWD_TYPES.includes(act) ? 300 : 400;
  const list = DESTINATIONS.filter((x) => x.id !== dest.id && x.types.includes(act))
    .map((x) => ({ x, mi: dist(dest.lat, dest.lon, x.lat, x.lon), q: buildDay(x, d, TODAY, { fc: cache[x.id]?.fc?.days[iso(d)] || null, live: cache[x.id]?.fc?.live, activity: act, space }).score }))
    .filter((c) => c.mi <= radius && c.q.total >= rec.score.total + 5).sort((a, b) => b.q.total - a.q.total).slice(0, 5);
  if (!list.length) return `<div class="card"><h3>Nearby swaps</h3><p class="small" style="margin:0">Nothing within ${radius} miles scores meaningfully better for ${ACTIVITIES[act].label.toLowerCase()} on this date.</p></div>`;
  return `<div class="card"><h3>Nearby swaps for this date</h3><table>${list.map((c, i) => `<tr data-dest="${c.x.id}" style="cursor:pointer"><td><span class="chip soft">${i ? "Better" : "Best"}</span></td><td><b>${esc(c.x.name)}</b><br><span class="muted small">${esc(c.x.area)} · ${Math.round(c.mi)} mi</span></td><td>${scoreChip(c.q)}</td><td class="small">+${c.q.total - rec.score.total}</td></tr>`).join("")}</table></div>`;
}

function strip(dest) {
  return `<div class="card"><h3>Next 16 days</h3><div class="strip">${Array.from({ length: 16 }, (_, i) => addDays(TODAY, i)).map((x) => {
    const q = day(dest, x), w = q.weather;
    return `<div class="day ${iso(x) === state.date ? "sel" : ""}" data-date="${iso(x)}">${fmt(x, { weekday: "short", day: "numeric" })}<b>${w.icon || ""} ${w.tmaxF ?? "—"}°</b>${w.snowIn ? `❄️ ${w.snowIn}"` : `${w.precipProb ?? "—"}% 💧`}<br><span style="color:${q.score.color}">● ${q.score.total}</span></div>`; }).join("")}</div></div>`;
}

const TABS = {
  overview(dest, d, rec) {
    const w = rec.weather, cst = rec.cost;
    return `${scoreCard(rec)}${swaps(dest, d, rec)}${activityCards(dest, rec)}
      <div class="grid">
        ${stat("Weather", `${w.icon} ${w.tmaxF ?? "—"}° / ${w.tminF ?? "—"}°`, esc(w.summary))}
        ${stat("Precip chance", w.precipProb != null ? w.precipProb + "%" : "—", w.snowIn ? `Snow ${w.snowIn}"` : "")}
        ${stat("Crowds", chip(rec.crowds.label, rec.crowds.color), `${rec.crowds.level}/10`)}
        ${stat("Flights", chip(cst.flight.label, cst.flight.color), `${pct(cst.flight.pct)} vs avg`)}
        ${stat("Hotels", chip(cst.hotel.label, cst.hotel.color), `${pct(cst.hotel.pct)} vs avg`)}
        ${stat("Air quality", rec.air ? `AQI ${rec.air.aqi}` : "—", rec.air ? esc(rec.air.label) : "Forecast covers ~5 days")}
        ${stat("Travel advisory", ADVISORY[dest.country] ? `Level ${ADVISORY[dest.country]}` : dest.country === "US" ? "Domestic" : "—", "US State Dept (verify)")}
        ${stat("Daylight", `${rec.daylightHours} h`, w.sunrise ? `${w.sunrise}–${w.sunset}` : "Sunrise to sunset")}
        ${stat("Moon", `${rec.moon.illumination}%`, `${rec.moon.phase}${rec.moon.darkSky ? " · dark skies" : ""}`)}
      </div>
      ${(dest.notes || []).length ? `<div class="card small"><h3>Good to know</h3><ul class="clean">${dest.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
      ${strip(dest)}`;
  },

  rank(dest, d) {
    const all = allFor(d);
    const act = state.activity === "all" ? mainActivity(dest) : state.activity;
    const pool = DESTINATIONS.filter((x) => x.types.includes(act) && (state.scope === "all" || (state.scope === "near" ? dist(dest.lat, dest.lon, x.lat, x.lon) <= 600 : x.country === state.scope)));
    const rows = pool.map((x) => ({ x, q: state.activity === "all" && all.get(x.id).score.activity !== act ? buildDay(x, d, TODAY, { activity: act, space }).score : all.get(x.id).score }))
      .sort((a, b) => b.q.total - a.q.total).slice(0, 40);
    const countries = [...new Set(DESTINATIONS.map((x) => x.country))].sort();
    return `<div class="card"><h3>Best for ${ACTIVITIES[act].icon} ${esc(ACTIVITIES[act].label)} on ${esc(state.date)}</h3>
      <label class="small muted">Show <select id="scope"><option value="all">Everywhere</option><option value="near"${state.scope === "near" ? " selected" : ""}>Within 600 mi of ${esc(dest.name)}</option>${countries.map((c) => `<option value="${c}"${state.scope === c ? " selected" : ""}>${c}</option>`).join("")}</select></label>
      <table style="margin-top:8px"><tr><th>#</th><th>Destination</th><th>Score</th>${Object.keys(ACTIVITIES[act].weights).slice(0, 3).map((k) => `<th>${METRICS[k]}</th>`).join("")}</tr>
      ${rows.map(({ x, q }, i) => `<tr data-dest="${x.id}" style="cursor:pointer"><td>${i + 1}</td><td><b>${esc(x.name)}</b><br><span class="muted small">${esc(x.area)}</span></td><td>${scoreChip(q)}</td>${Object.keys(ACTIVITIES[act].weights).slice(0, 3).map((k) => `<td>${q.parts[k] ?? "—"}</td>`).join("")}</tr>`).join("")}</table>
      <p class="small muted">Pick an activity at the top to rank a different type. Metric columns are 1–100 scores (higher is better).</p></div>`;
  },

  cost(dest, d, rec) {
    const air = dest.airports?.[0], back = iso(addDays(d, 4));
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(d, i * 7)).filter((x) => x <= MAX);
    return `<div class="card"><h3>Travel cost on ${esc(state.date)}</h3><div class="grid">
      ${stat("Flights", chip(rec.cost.flight.label, rec.cost.flight.color), `${pct(rec.cost.flight.pct)} vs this route's average`)}
      ${stat("Hotels", chip(rec.cost.hotel.label, rec.cost.hotel.color), `${pct(rec.cost.hotel.pct)} vs average nightly rate`)}
      ${stat("Trip overall", chip(rec.cost.combined.label, rec.cost.combined.color), pct(rec.cost.combined.pct))}
    </div><p class="small">${esc(rec.cost.tip)}. Book domestic flights about 1–3 months ahead; holiday and peak-season trips 3–6 months ahead.</p>
    <p class="links small">Live prices: ${air ? `<a href="https://www.google.com/travel/flights?q=${encodeURIComponent(`flights to ${air} on ${state.date} returning ${back}`)}" target="_blank" rel="noopener">Google Flights to ${air}</a>` : ""}
      <a href="https://www.google.com/travel/search?q=${encodeURIComponent(`hotels near ${dest.name} ${dest.area}`)}&checkin=${state.date}&checkout=${back}" target="_blank" rel="noopener">Hotels near ${esc(dest.name)}</a>
      <a href="https://www.kayak.com/flights/-${air}/${state.date}/${back}" target="_blank" rel="noopener">Kayak</a></p>
    <p class="small muted">Price levels are modeled from seasonal demand, holidays, events and day of week; they show when it's cheaper to go, not actual fares.</p></div>
    <div class="card"><h3>Week by week</h3><table><tr><th>Week of</th><th>Flights</th><th>Hotels</th><th>Score</th></tr>
      ${weeks.map((x) => { const q = day(dest, x); return `<tr data-date="${iso(x)}" style="cursor:pointer"><td>${fmt(x, { month: "short", day: "numeric" })}</td><td>${pct(q.cost.flight.pct)}</td><td>${pct(q.cost.hotel.pct)}</td><td>${scoreChip(q.score)}</td></tr>`; }).join("")}</table></div>`;
  },

  data(dest) {
    return `<div class="card"><h3>Download ${esc(dest.name)}</h3><p>365 days of scores, weather, crowds, costs and activity conditions.</p>
      <button data-download="json">Download JSON</button> <button data-download="csv">Download CSV</button></div>
      <div class="card small"><h3>About the data</h3><ul class="clean">
      <li>${DESTINATIONS.length} destinations: ${Object.entries(ACTIVITIES).map(([k, a]) => `${a.icon} ${DESTINATIONS.filter((x) => x.types.includes(k)).length} ${a.label.toLowerCase()}`).join(", ")}.</li>
      <li>Weather: 16-day Open-Meteo forecast, then typical monthly climate.</li>
      <li>Ski seasons, foliage peaks, bug seasons, crowds and price indexes are typical patterns; verify against resort reports, state foliage maps and live fares.</li></ul></div>`;
  },
};

// ---------- 12-month chart ----------
function year(dest, sel) {
  const W = 720, H = 190, P = { l: 30, r: 10, t: 10, b: 24 };
  const pts = Array.from({ length: 366 }, (_, i) => day(dest, addDays(TODAY, i)));
  const x = (i) => P.l + (i / 365) * (W - P.l - P.r), y = (v) => P.t + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - P.t - P.b);
  const line = (f, col, dash = "") => { let s = "", pen = false; pts.forEach((q, i) => { const v = f(q); if (v == null) { pen = false; return; } s += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return `<path d="${s}" fill="none" stroke="${col}" stroke-width="1.8" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`; };
  const series = [[(q) => q.score.total, "#2e9e6b", "", "Favorability"], [(q) => q.crowds.score, "#6b4fbb", "", "Crowds"], [(q) => q.cost.combined.index * 50, "#e0772b", "4 3", "Cost (100 = 2× avg)"], [(q) => q.weather.tmaxF, "#0d7ea8", "2 2", "High °F"]];
  if (dest.fall) series.push([(q) => q.fall.color, "#c8372d", "", "Fall color"]);
  if (dest.bugs) series.push([(q) => q.bugs.index, "#8a6d3b", "6 2", "Bugs"]);
  const months = pts.map((q, i) => [parseISO(q.date), i]).filter(([d]) => d.getUTCDate() === 1).map(([d, i]) => `<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--line)"/><text x="${x(i) + 2}" y="${H - 8}" font-size="10" fill="var(--muted)">${fmt(d, { month: "short" })}</text>`).join("");
  const si = Math.round((sel - TODAY) / DAY);
  $("#year").innerHTML = `<svg viewBox="0 0 ${W} ${H}">${[0, 50, 100].map((v) => `<text x="2" y="${y(v) + 3}" font-size="10" fill="var(--muted)">${v}</text>`).join("")}${months}${series.map(([f, c, dd]) => line(f, c, dd)).join("")}<line x1="${x(si)}" x2="${x(si)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--ink)" stroke-width="1.5"/></svg>
    <div class="lg">${series.map(([, c, , n]) => `<span style="--c:${c}">${n}</span>`).join("")}</div>`;
  const svg = $("#year svg");
  svg.onclick = (e) => { const b = svg.getBoundingClientRect(); const i = Math.round((((e.clientX - b.left) / b.width) * W - P.l) / (W - P.l - P.r) * 365); setDate(iso(addDays(TODAY, Math.max(0, Math.min(365, i))))); };
}

// ---------- export ----------
function download(dest, kind) {
  const rows = Array.from({ length: 366 }, (_, i) => day(dest, addDays(TODAY, i)));
  let blob;
  if (kind === "json") blob = new Blob([JSON.stringify({ destination: dest, generated: new Date().toISOString(), days: rows }, null, 2)], { type: "application/json" });
  else {
    const keys = Object.keys(METRICS);
    const head = ["date", "activity", "score", ...keys.map((k) => "score_" + k), "tmax_f", "tmin_f", "precip_prob", "snow_in", "crowd_level", "flight_vs_avg_pct", "hotel_vs_avg_pct", "ski_open", "ski_base_in", "fall_color", "fall_status", "bugs_index", "events"];
    const lines = rows.map((q) => [q.date, q.score.activity, q.score.total, ...keys.map((k) => q.score.parts[k]), q.weather.tmaxF, q.weather.tminF, q.weather.precipProb, q.weather.snowIn, q.crowds.level, q.cost.flight.pct, q.cost.hotel.pct, q.ski?.open, q.ski?.typicalBaseIn, q.fall?.color, q.fall?.status, q.bugs?.index, [...q.crowds.drivers].join("; ")].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${dest.id}-conditions.${kind}` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- boot ----------
readHash();
setupMap();
setup();
select(state.id, false);
api.spaceWeather().then((s) => { space = Object.keys(s).length ? s : null; memo.clear(); render(); paint(); }).catch(() => {});
setInterval(() => load(state.id, true), 15 * 60 * 1000);
