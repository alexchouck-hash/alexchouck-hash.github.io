import { header, $, esc, getJSON, temp, rain, unitToggle, units, dayLabel, isoDay, addDays, baseMap, gradePill } from "../assets/shared.js";
import { FALLS } from "./spots.js";
import { flowNow, outlook, flowClass, seasonal, CLASSES } from "./model.js";

header("waterfalls");
const TODAY = isoDay(), YEAR = +TODAY.slice(0, 4), LOOKBACK = 30;
const byId = Object.fromEntries(FALLS.map((f) => [f.id, f]));
let sel = byId[location.hash.slice(1)] ? location.hash.slice(1) : null, data, map, markers = {};
const arr = (j) => (Array.isArray(j) ? j : [j]);

async function load() {
  const q = (fn) => FALLS.map(fn).join(",");
  const pts = `latitude=${q((f) => f.lat)}&longitude=${q((f) => f.lon)}`;
  const start = addDays(TODAY, -LOOKBACK), end = addDays(TODAY, -1);
  // Same 30-day window in each of the last 3 years (ERA5 archive).
  const years = [1, 2, 3].map((k) => [`${YEAR - k}${start.slice(4)}`, `${YEAR - k}${end.slice(4)}`]).map(([a, b]) => (a > b ? [`${+a.slice(0, 4) - 1}${a.slice(4)}`, b] : [a, b]));
  const [fc, ...hist] = await Promise.all([
    getJSON(`https://api.open-meteo.com/v1/forecast?${pts}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,cloud_cover_mean&past_days=${LOOKBACK}&forecast_days=10&timezone=auto`, 60),
    ...years.map(([a, b]) => getJSON(`https://archive-api.open-meteo.com/v1/archive?${pts}&start_date=${a}&end_date=${b}&daily=precipitation_sum&timezone=auto`, 60 * 24 * 7)),
  ]);
  data = {};
  arr(fc).forEach((f, k) => {
    const fall = FALLS[k], d = f.daily, local = d.time.find((t) => t >= TODAY) ?? TODAY;
    const past = d.time.map((t, i) => (t < local ? i : -1)).filter((i) => i >= 0);
    const ahead = d.time.map((t, i) => (t >= local ? i : -1)).filter((i) => i >= 0);
    const cur = past.map((i) => d.precipitation_sum[i]);
    const normals = hist.map((h) => arr(h)[k]?.daily?.precipitation_sum || []).filter((p) => p.length);
    const now = flowNow(fall, TODAY, cur, normals, past.map((i) => d.temperature_2m_max[i]));
    const pick = (key) => ahead.map((i) => d[key][i]);
    const out = outlook(fall, now, now.norm, { date: ahead.map((i) => d.time[i]), precip: pick("precipitation_sum"), tmax: pick("temperature_2m_max"), cloud: pick("cloud_cover_mean") });
    data[fall.id] = { now, out, rain7: cur.slice(-7).reduce((a, v) => a + (v || 0), 0) };
  });
}

function drawMap() {
  map ||= baseMap("map", [38, -95], 4);
  for (const f of FALLS) {
    const c = flowClass(data[f.id].now.flow);
    markers[f.id]?.remove();
    markers[f.id] = L.circleMarker([f.lat, f.lon], { radius: sel === f.id ? 10 : 7, color: "#fff", weight: 2, fillColor: c.color, fillOpacity: 0.95 })
      .bindTooltip(`<b>${esc(f.name)}</b><br>${c.label} (${data[f.id].now.flow}/100)`).on("click", () => choose(f.id)).addTo(map);
  }
  $("#legend").innerHTML = CLASSES.map(([, l, c]) => `<span style="margin-right:10px"><span class="pill" style="background:${c}">&nbsp;</span> ${l}</span>`).join("");
}

function detail() {
  if (!sel) { $("#detail").innerHTML = `<div class="card"><h2>Which falls are roaring?</h2><p class="small muted">Pick a waterfall on the map or below. The list is ranked by the best day to visit this week.</p></div>`; return; }
  const f = byId[sel], { now, out, rain7 } = data[sel], c = flowClass(now.flow), top = [...out].sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.date);
  const regime = { rain: "Rain-fed", snowmelt: "Snowmelt-fed", river: "Big river", steady: "Spring-fed or regulated" }[f.regime];
  const wet = now.ratio >= 1.5 ? `a wet month (${Math.round(now.ratio * 100)}% of normal recent rain)` : now.ratio <= 0.6 ? `a dry month (${Math.round(now.ratio * 100)}% of normal recent rain)` : "about normal recent rain";
  $("#detail").innerHTML = `<div class="card"><h2>${esc(f.name)}</h2>
    <div class="small muted">${esc(f.region)}, ${esc(f.country)} · ${units.us ? Math.round(f.heightM * 3.281) + " ft" : f.heightM + " m"} tall · ${regime}</div>
    <div class="kpis">
      <div class="kpi"><b style="color:${c.color}">${c.label}</b><span>Flow now (${now.flow}/100)</span></div>
      <div class="kpi"><b>${flowClass(Math.round(seasonal(f, TODAY))).label}</b><span>Typical for ${new Date(TODAY + "T12:00Z").toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })}</span></div>
      <div class="kpi"><b>${rain(rain7)}</b><span>Rain, last 7 days</span></div>
      ${now.frozen ? `<div class="kpi"><b>🧊 Ice</b><span>Frozen formations likely</span></div>` : ""}
    </div>
    <p class="small">Why: ${wet}${f.regime === "steady" ? ", though this fall barely depends on rain" : f.regime !== "rain" ? `, and it's mostly driven by its ${f.regime === "snowmelt" ? "snowmelt season" : "river's season"}` : ""}.${f.note ? " " + esc(f.note) : ""}</p>
    <h3>Best days to visit</h3>
    <div class="days">${out.map((d) => { const dc = flowClass(d.flow); return `<div class="day" style="${top.includes(d.date) ? "border-color:var(--accent)" : ""}"><b>${dayLabel(d.date)}</b><div class="score">${d.score}</div>${gradePill(d.score)}
      <div style="color:${dc.color}">${dc.label} flow</div><div class="muted">${temp(d.tmax)} · ${rain(d.rain)}</div>${d.rainbow ? "<div>🌈 rainbow chance</div>" : ""}${d.frozen ? "<div>🧊 icy</div>" : ""}</div>`; }).join("")}</div></div>`;
}

function rank() {
  const rows = FALLS.map((f) => ({ f, d: data[f.id], best: Math.max(0, ...data[f.id].out.slice(0, 7).map((x) => x.score)) })).sort((a, b) => b.best - a.best);
  $("#rank").innerHTML = `<div class="card"><h3>This week's best waterfalls</h3><div class="scroll"><table>
    <thead><tr><th>Waterfall</th><th>Flow now</th><th class="num">Best day, 7 d</th></tr></thead><tbody>
    ${rows.map(({ f, d, best }) => { const c = flowClass(d.now.flow); return `<tr data-id="${f.id}" class="${sel === f.id ? "sel" : ""}"><td>${esc(f.name)} <span class="muted small">${esc(f.region)}</span></td><td><span class="pill" style="background:${c.color}">${c.label}</span></td><td class="num">${best}</td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  document.querySelectorAll("#rank tr[data-id]").forEach((tr) => (tr.onclick = () => choose(tr.dataset.id)));
}

function choose(id) { sel = id; $("#fall").value = id; history.replaceState(null, "", "#" + id); render(); map.setView([byId[id].lat, byId[id].lon], 8); $("#detail").scrollIntoView({ behavior: "smooth", block: "start" }); }
const render = () => { drawMap(); detail(); rank(); };

$("#fall").innerHTML = `<option value="">All waterfalls</option>` + FALLS.map((f) => `<option value="${f.id}">${esc(f.name)} (${esc(f.region)})</option>`).join("");
$("#fall").value = sel || "";
$("#fall").onchange = (e) => (e.target.value ? choose(e.target.value) : ((sel = null), render()));
$("#units").append(unitToggle(() => data && render()));
$("#status").textContent = `Loading rain history and forecasts for ${FALLS.length} waterfalls…`;
load().then(() => { $("#status").textContent = ""; render(); if (sel) map.setView([byId[sel].lat, byId[sel].lon], 8); })
  .catch((e) => { $("#status").textContent = `Could not load weather: ${e.message}`; $("#status").classList.add("err"); });
