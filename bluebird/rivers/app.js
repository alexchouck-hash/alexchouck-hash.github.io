import { header, $, esc, getJSON, getText, rain, unitToggle, units, baseMap, hashPoint, setHashPoint } from "../assets/shared.js";
import { parseIV, parseStats, percentile, rate, trend, RATINGS, clampBox } from "./model.js";

header("rivers");
// Well-known paddling regions (map views, not gauge lists).
const REGIONS = [
  ["Southern Appalachians (Nantahala, Ocoee, Chattooga)", [35.2, -83.4], 8], ["New River Gorge & Gauley, WV", [38.1, -81.0], 9],
  ["Potomac & Shenandoah", [39.1, -77.7], 8], ["Adirondacks & Hudson", [43.8, -74.2], 8], ["Maine North Woods", [45.6, -69.6], 8],
  ["Ozarks (Buffalo, Current)", [36.4, -92.2], 8], ["Boundary Waters, MN", [47.9, -91.5], 8], ["Upper Colorado & Arkansas, CO", [38.9, -106.1], 8],
  ["Idaho whitewater (Payette, Salmon)", [44.4, -115.8], 8], ["Oregon (Rogue, McKenzie, Deschutes)", [44.0, -122.6], 8],
  ["California Sierra (American, Tuolumne)", [38.5, -120.6], 8], ["Texas Hill Country (Guadalupe)", [29.9, -98.4], 8], ["Florida springs & rivers", [29.4, -82.6], 8],
];
const start = hashPoint(REGIONS[0][1]);
const map = baseMap("map", start, location.hash ? 9 : REGIONS[0][2]);
let gauges = {}, stats = {}, layer = L.layerGroup().addTo(map), sel = null, timer, reqId = 0;
const cfs = (v) => (v == null ? "–" : units.us ? `${Math.round(v).toLocaleString()} cfs` : `${(v * 0.0283168).toFixed(v * 0.0283168 < 10 ? 1 : 0)} m³/s`);
const ft = (v) => (v == null ? "–" : units.us ? `${v.toFixed(2)} ft` : `${(v * 0.3048).toFixed(2)} m`);

$("#jump").innerHTML = `<option value="">Choose a region…</option>` + REGIONS.map(([n], k) => `<option value="${k}">${esc(n)}</option>`).join("");
$("#jump").onchange = (e) => { const r = REGIONS[e.target.value]; if (r) map.setView(r[1], r[2]); };
$("#units").append(unitToggle(() => { list(); detail(); }));
$("#legend").innerHTML = Object.values(RATINGS).map((r) => `<span style="margin-right:10px"><span class="pill" style="background:${r.color}">&nbsp;</span> ${r.label}</span>`).join("");

async function loadView() {
  if (map.getZoom() < 7) { $("#status").textContent = "Zoom in to a region to load river gauges."; return; }
  const b = map.getBounds(), box = clampBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  const id = ++reqId;
  $("#status").textContent = "Loading live gauges…"; $("#status").classList.remove("err");
  try {
    const iv = await getJSON(`https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${box.join(",")}&parameterCd=00060,00065&siteType=ST&siteStatus=active&period=P1D`, 10);
    if (id !== reqId) return;
    gauges = Object.fromEntries(Object.entries(parseIV(iv)).filter(([, g]) => g.flow != null));
    const need = Object.keys(gauges).filter((s) => !(s in stats));
    const now = new Date(), m = now.getMonth() + 1, d = now.getDate();
    for (let k = 0; k < need.length; k += 60) {
      const chunk = need.slice(k, k + 60);
      try {
        const rdb = await getText(`https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=${chunk.join(",")}&statReportType=daily&statTypeCd=p10,p25,p50,p75,p90&parameterCd=00060`, 60 * 24);
        const parsed = parseStats(rdb, m, d);
        for (const s of chunk) stats[s] = parsed[s] || null;
      } catch { for (const s of chunk) stats[s] = null; }
    }
    if (id !== reqId) return;
    for (const g of Object.values(gauges)) { g.pct = percentile(g.flow, stats[g.site]); g.rating = rate(g.pct, g.flow, g.flowPrev); g.trend = trend(g.flow, g.flowPrev); }
    $("#status").textContent = Object.keys(gauges).length ? "" : "No active stream gauges with flow data in this view.";
    draw(); list();
  } catch (e) { $("#status").textContent = `Could not load USGS gauges: ${e.message}`; $("#status").classList.add("err"); }
}

function draw() {
  layer.clearLayers();
  for (const g of Object.values(gauges)) {
    const r = RATINGS[g.rating];
    L.circleMarker([g.lat, g.lon], { radius: sel === g.site ? 10 : 6, color: "#fff", weight: 1.5, fillColor: r.color, fillOpacity: 0.95 })
      .bindTooltip(`<b>${esc(g.name)}</b><br>${cfs(g.flow)} · ${r.label}`).on("click", () => choose(g.site)).addTo(layer);
  }
}

function list() {
  const rows = Object.values(gauges).sort((a, b) => (RATINGS[b.rating].score ?? -1) - (RATINGS[a.rating].score ?? -1) || (b.flow ?? 0) - (a.flow ?? 0));
  if (!rows.length) { $("#list").innerHTML = ""; return; }
  $("#list").innerHTML = `<div class="card"><h3>${rows.length} gauges in view</h3><div class="scroll"><table>
    <thead><tr><th>Gauge</th><th class="num">Flow</th><th class="num">vs normal</th><th>Rating</th></tr></thead><tbody>
    ${rows.map((g) => `<tr data-id="${g.site}" class="${sel === g.site ? "sel" : ""}"><td>${esc(g.name)}${g.trend ? ` <span class="muted small">${g.trend === "rising" ? "↑" : g.trend === "falling" ? "↓" : "→"} ${g.trend}</span>` : ""}</td>
      <td class="num">${cfs(g.flow)}</td><td class="num">${g.pct != null ? g.pct + "%" : "–"}</td><td><span class="pill" style="background:${RATINGS[g.rating].color}">${RATINGS[g.rating].label}</span></td></tr>`).join("")}
    </tbody></table></div></div>`;
  document.querySelectorAll("#list tr[data-id]").forEach((tr) => (tr.onclick = () => choose(tr.dataset.id)));
}

async function detail() {
  const g = gauges[sel];
  if (!g) { $("#detail").innerHTML = ""; return; }
  const r = RATINGS[g.rating], p = stats[g.site];
  $("#detail").innerHTML = `<div class="card"><h2>${esc(g.name)}</h2>
    <div class="small muted">USGS ${g.site} · updated ${new Date(g.time).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
    <div class="kpis">
      <div class="kpi"><b>${cfs(g.flow)}</b><span>Flow now${g.trend ? `, ${g.trend}` : ""}</span></div>
      <div class="kpi"><b>${ft(g.stage)}</b><span>Gauge height</span></div>
      <div class="kpi"><b>${g.pct != null ? g.pct + "%" : "–"}</b><span>Percentile for today's date</span></div>
      <div class="kpi"><b style="color:${r.color}">${r.label}</b><span>Rating</span></div>
    </div>
    ${p ? `<p class="small">Typical for today: ${cfs(p.p25)} to ${cfs(p.p75)} (median ${cfs(p.p50)}).</p>` : `<p class="small muted">This gauge has no daily history, so it can't be rated.</p>`}
    <p class="small" id="rain">Checking rain forecast…</p>
    <p class="small"><a href="https://waterdata.usgs.gov/monitoring-location/USGS-${g.site}/" target="_blank" rel="noopener">USGS gauge page</a></p></div>`;
  try {
    const f = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&daily=precipitation_sum,precipitation_probability_max&forecast_days=3&timezone=auto`, 30);
    const tot = f.daily.precipitation_sum.reduce((a, v) => a + (v || 0), 0);
    if (sel === g.site) $("#rain").innerHTML = tot >= 20 ? `<b>Heavy rain ahead:</b> ${rain(tot)} over 3 days near the gauge. Expect levels to rise.` : tot >= 5 ? `Some rain ahead (${rain(tot)} over 3 days) may raise levels.` : `Little rain forecast for the next 3 days (${rain(tot)}).`;
  } catch { if (sel === g.site) $("#rain").textContent = ""; }
}

function choose(site) { sel = site; draw(); list(); detail(); $("#detail").scrollIntoView({ behavior: "smooth", block: "start" }); }
map.on("moveend", () => { setHashPoint([map.getCenter().lat, map.getCenter().lng]); clearTimeout(timer); timer = setTimeout(loadView, 500); });
loadView();
