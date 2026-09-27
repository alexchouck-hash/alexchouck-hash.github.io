import { header, $, esc, getJSON, temp, rain, speed, unitToggle, dayLabel, isoDay, baseMap, gradePill } from "../assets/shared.js";
import { SPOTS } from "./spots.js";
import { predict, bestDays, colorPct, stage, doyOf, fromDoy } from "./model.js";

header("foliage");
const TODAY = isoDay();
const YEAR = +TODAY.slice(0, 4);
const byId = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
let sel = byId[location.hash.slice(1)] ? location.hash.slice(1) : null;
let data, map, markers = {};

// One request each for all spots: recent + forecast, and 3 prior years of history.
async function load() {
  const q = (f) => SPOTS.map(f).join(",");
  const pts = `latitude=${q((s) => s.lat)}&longitude=${q((s) => s.lon)}&elevation=${q((s) => s.elev)}`;
  const past = Math.min(92, Math.max(1, doyOf(TODAY) - doyOf(`${YEAR}-08-01`)));
  const [fc, hist] = await Promise.all([
    getJSON(`https://api.open-meteo.com/v1/forecast?${pts}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,cloud_cover_mean,wind_gusts_10m_max&past_days=${past}&forecast_days=16&timezone=auto`, 60),
    getJSON(`https://archive-api.open-meteo.com/v1/archive?${pts}&start_date=${YEAR - 3}-08-01&end_date=${YEAR - 1}-11-30&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=auto`, 60 * 24 * 7),
  ]);
  const arr = (j) => (Array.isArray(j) ? j : [j]);
  const pick = (d) => ({ date: d.time, tmean: d.temperature_2m_mean, tmin: d.temperature_2m_min, tmax: d.temperature_2m_max, precip: d.precipitation_sum });
  data = {};
  arr(fc).forEach((f, k) => {
    const s = SPOTS[k], cur = pick(f.daily);
    const h = arr(hist)[k].daily;
    // Keep only Aug–Nov of past years so the rain normal compares like with like.
    const keep = h.time.map((d, i) => (d.slice(5) >= "08-01" && d.slice(5) <= "11-30" ? i : -1)).filter((i) => i >= 0);
    const pastD = { date: keep.map((i) => h.time[i]), tmean: keep.map((i) => h.temperature_2m_mean[i]), tmin: keep.map((i) => h.temperature_2m_min[i]), tmax: keep.map((i) => h.temperature_2m_max[i]), precip: keep.map((i) => h.precipitation_sum[i]) };
    const pred = predict(s, TODAY, cur, pastD);
    const fcD = { date: f.daily.time, tmax: f.daily.temperature_2m_max, precip: f.daily.precipitation_sum, pop: f.daily.precipitation_probability_max, cloud: f.daily.cloud_cover_mean, gust: f.daily.wind_gusts_10m_max };
    data[s.id] = { pred, best: bestDays(pred, TODAY, fcD) };
  });
}

function drawMap() {
  map ||= baseMap("map", [42, -85], 4);
  for (const s of SPOTS) {
    const p = data[s.id].pred, st = stage(-p.daysToPeak);
    markers[s.id]?.remove();
    markers[s.id] = L.circleMarker([s.lat, s.lon], { radius: sel === s.id ? 10 : 7, color: "#fff", weight: 2, fillColor: st.color, fillOpacity: 0.95 })
      .bindTooltip(`<b>${esc(s.name)}</b><br>${st.label} · peak ≈ ${dayLabel(p.peak)}`).on("click", () => choose(s.id)).addTo(map);
  }
  const seen = ["Mostly green", "Turning", "Near peak", "Peak color", "Past peak", "Leaves down"];
  $("#legend").innerHTML = seen.map((l, k) => { const c = stage([-30, -14, -5, 0, 7, 20][k]).color; return `<span style="margin-right:10px"><span class="pill" style="background:${c}">&nbsp;</span> ${l}</span>`; }).join("");
}

// Season curve: share of trees in color from Sep 1 to Nov 30, today and peak marked.
function chart(p) {
  const W = 560, H = 150, pad = 22, a = doyOf(`${YEAR}-09-01`), b = doyOf(`${YEAR}-11-30`);
  const x = (n) => pad + ((n - a) / (b - a)) * (W - 2 * pad), y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const pts = []; for (let n = a; n <= b; n++) pts.push([x(n), y(colorPct(n - p.peakDoy))]);
  const line = pts.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const t = doyOf(TODAY);
  const months = [["Sep", "09-01"], ["Oct", "10-01"], ["Nov", "11-01"]].map(([l, d]) => `<text x="${x(doyOf(`${YEAR}-${d}`)) + 2}" y="${H - 6}">${l}</text><line class="grid" x1="${x(doyOf(`${YEAR}-${d}`))}" x2="${x(doyOf(`${YEAR}-${d}`))}" y1="${pad}" y2="${H - pad}"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Expected share of trees in full color, Sep 1 to Nov 30. Peak around ${dayLabel(p.peak)}.">
    ${months}<line class="grid" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>
    <path class="area" d="${line}L${x(b)},${y(0)}L${x(a)},${y(0)}Z"/><path class="line" d="${line}"/>
    ${t >= a && t <= b ? `<line class="today" x1="${x(t)}" x2="${x(t)}" y1="${pad - 8}" y2="${H - pad}"/><text x="${x(t) + 3}" y="${pad - 10}">today</text>` : ""}
    <line class="hover" id="hv" y1="${pad}" y2="${H - pad}" visibility="hidden"/>
    <rect id="hit" x="${pad}" y="0" width="${W - 2 * pad}" height="${H}" fill="transparent"/>
  </svg><div class="tip" id="tip">Hover the curve for a date.</div>`;
}
function bindChart(p) {
  const svg = $("#detail svg"), hit = $("#hit"), hv = $("#hv"), a = doyOf(`${YEAR}-09-01`), b = doyOf(`${YEAR}-11-30`);
  if (!hit) return;
  hit.onpointermove = (e) => {
    const r = svg.getBoundingClientRect(), W = 560, pad = 22;
    const px = ((e.clientX - r.left) / r.width) * W, n = Math.round(a + ((px - pad) / (W - 2 * pad)) * (b - a));
    hv.setAttribute("x1", px); hv.setAttribute("x2", px); hv.setAttribute("visibility", "visible");
    $("#tip").textContent = `${dayLabel(fromDoy(YEAR, n))}: about ${colorPct(n - p.peakDoy)}% of trees in full color (${stage(n - p.peakDoy).label.toLowerCase()})`;
  };
  hit.onpointerleave = () => hv.setAttribute("visibility", "hidden");
}

function detail() {
  if (!sel) { $("#detail").innerHTML = `<div class="card"><h2>Where's the color?</h2><p class="small muted">Pick a destination on the map or below. Spots are ranked by how close they are to peak this week.</p></div>`; return; }
  const s = byId[sel], { pred: p, best } = data[sel], st = stage(-p.daysToPeak);
  const why = [
    p.anomaly ? `${Math.abs(p.anomaly)} °C ${p.anomaly > 0 ? "warmer" : "cooler"} than recent years` : "temperatures near normal",
    p.frost ? "an early hard frost" : null,
    p.drought ? `a dry late summer (${Math.round(p.rainRatio * 100)}% of normal rain)` : null,
  ].filter(Boolean).join(", ");
  const top = [...best].sort((a, b) => b.score - a.score).slice(0, 3).map((d) => d.date);
  $("#detail").innerHTML = `<div class="card">
    <h2>${esc(s.name)}</h2><div class="small muted">${esc(s.region)}, ${esc(s.country)} · ${esc(s.trees)} · ${Math.round(s.elev)} m</div>
    <div class="kpis">
      <div class="kpi"><b style="color:${st.color}">${st.label}</b><span>Now</span></div>
      <div class="kpi"><b>${dayLabel(p.peak)}</b><span>Predicted peak (${p.daysToPeak > 0 ? `in ${p.daysToPeak} days` : p.daysToPeak < 0 ? `${-p.daysToPeak} days ago` : "today"})</span></div>
      <div class="kpi"><b>${p.brilliance}</b><span>Brilliance / 100</span></div>
      <div class="kpi"><b>${p.shift > 0 ? "+" : ""}${p.shift} d</b><span>vs typical ${dayLabel(fromDoy(YEAR, p.basePeak))}</span></div>
    </div>
    <p class="small">Why: ${why}.</p>
    ${chart(p)}
    <h3 style="margin-top:12px">Best days to go (next ${best.length})</h3>
    <div class="days">${best.map((d) => `<div class="day" style="${top.includes(d.date) ? "border-color:var(--accent)" : ""}"><b>${dayLabel(d.date)}</b><div class="score">${d.score}</div>${gradePill(d.score)}<div>${d.color}% color</div><div class="muted">${temp(d.tmax)} · ${rain(d.precip)}${d.gust > 50 ? ` · gusts ${speed(d.gust)}` : ""}</div></div>`).join("")}</div>
  </div>`;
  bindChart(p);
}

function rank() {
  const rows = SPOTS.map((s) => ({ s, p: data[s.id].pred, best: Math.max(0, ...data[s.id].best.slice(0, 7).map((d) => d.score)) }))
    .sort((a, b) => b.best - a.best || Math.abs(a.p.daysToPeak) - Math.abs(b.p.daysToPeak));
  $("#rank").innerHTML = `<div class="card"><h3>This week's best color</h3><div class="scroll"><table>
    <thead><tr><th>Destination</th><th>Now</th><th class="num">Peak</th><th class="num">Best day, 7 d</th></tr></thead><tbody>
    ${rows.map(({ s, p, best }) => { const st = stage(-p.daysToPeak); return `<tr data-id="${s.id}" class="${sel === s.id ? "sel" : ""}"><td>${esc(s.name)} <span class="muted small">${esc(s.region)}</span></td><td><span class="pill" style="background:${st.color}">${st.label}</span></td><td class="num">${dayLabel(p.peak)}</td><td class="num">${best}</td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  document.querySelectorAll("#rank tr[data-id]").forEach((tr) => (tr.onclick = () => choose(tr.dataset.id)));
}

function choose(id) {
  sel = id; $("#spot").value = id; history.replaceState(null, "", "#" + id);
  render();
  map.setView([byId[id].lat, byId[id].lon], 7);
  $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
}
const render = () => { drawMap(); detail(); rank(); };

$("#spot").innerHTML = `<option value="">All destinations</option>` + SPOTS.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.region)})</option>`).join("");
$("#spot").value = sel || "";
$("#spot").onchange = (e) => (e.target.value ? choose(e.target.value) : ((sel = null), render()));
$("#units").append(unitToggle(() => data && render()));
$("#status").textContent = "Loading this year's weather for 40 destinations…";
load().then(() => { $("#status").textContent = ""; render(); if (sel) map.setView([byId[sel].lat, byId[sel].lon], 7); })
  .catch((e) => { $("#status").textContent = `Could not load weather: ${e.message}`; $("#status").classList.add("err"); });
