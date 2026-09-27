import { header, $, esc, getJSON, temp, speed, rain, unitToggle, dayLabel, gradePill, moon, baseMap, hashPoint, setHashPoint } from "../assets/shared.js";
import { nights } from "./model.js";

header("camp");
const SPOTS = [["Yosemite Valley, CA", [37.74, -119.59]], ["Grand Canyon South Rim, AZ", [36.06, -112.14]], ["Zion, UT", [37.2, -112.98]], ["Yellowstone, WY", [44.6, -110.5]],
  ["Glacier, MT", [48.7, -113.8]], ["Olympic, WA", [47.8, -123.6]], ["Rocky Mountain, CO", [40.34, -105.68]], ["Great Smoky Mountains, TN", [35.61, -83.49]],
  ["Acadia, ME", [44.34, -68.27]], ["Boundary Waters, MN", [47.9, -91.5]], ["Big Bend, TX", [29.25, -103.25]], ["Banff, AB", [51.18, -115.57]]];
let pt = hashPoint(SPOTS[0][1]), cache = null;
const map = baseMap("map", pt, 8);
const marker = L.marker(pt).addTo(map);
$("#jump").innerHTML = `<option value="">Choose…</option>` + SPOTS.map(([n], k) => `<option value="${k}">${esc(n)}</option>`).join("");
$("#jump").onchange = (e) => { const s = SPOTS[e.target.value]; if (s) { map.setView(s[1], 8); go(s[1]); } };
$("#units").append(unitToggle(() => render()));
map.on("click", (e) => go([e.latlng.lat, e.latlng.lng]));

async function go(p) {
  pt = p; marker.setLatLng(p); setHashPoint(p);
  $("#status").textContent = "Loading forecast…"; $("#status").classList.remove("err");
  try {
    const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p[0]}&longitude=${p[1]}&hourly=temperature_2m,dew_point_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover,cape&daily=temperature_2m_max,precipitation_sum,sunset&forecast_days=14&timezone=auto`, 30);
    if (pt !== p) return;
    const x = j.hourly;
    const h = { time: x.time, temp: x.temperature_2m, dew: x.dew_point_2m, rh: x.relative_humidity_2m, precip: x.precipitation, pop: x.precipitation_probability, wind: x.wind_speed_10m, gust: x.wind_gusts_10m, cloud: x.cloud_cover, cape: x.cape };
    cache = { n: nights(h, (d) => moon(new Date(d + "T23:00Z")).illum), daily: j.daily, elev: j.elevation };
    $("#status").textContent = ""; render();
  } catch (e) { $("#status").textContent = `Could not load forecast: ${e.message}`; $("#status").classList.add("err"); }
}

function render() {
  if (!cache) return;
  const { n, daily, elev } = cache, top = [...n].sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.date);
  const dayIdx = Object.fromEntries(daily.time.map((d, i) => [d, i]));
  $("#out").innerHTML = `<div class="card"><h2>${pt[0].toFixed(3)}°, ${pt[1].toFixed(3)}°</h2>
    <div class="small muted">Elevation ${Math.round(elev)} m · best nights: ${top.map(dayLabel).join(", ")}</div>
    <div class="days" style="margin-top:10px">${n.map((x) => { const i = dayIdx[x.date]; return `<div class="day" style="${top.includes(x.date) ? "border-color:var(--accent)" : ""}"><b>${dayLabel(x.date)}</b><div class="score">${x.score}</div>${gradePill(x.score)}
      <div>Low ${temp(x.low)}${i != null ? ` · high ${temp(daily.temperature_2m_max[i])}` : ""}</div><div>${x.rain > 0.2 ? `Rain ${rain(x.rain)}` : "Dry night"}${x.gust > 35 ? ` · gusts ${speed(x.gust)}` : ""}</div>
      <div>✨ Stars ${x.stars}</div>
      <div class="muted">${[x.storm && "⚡ storms", x.frost && "❄️ frost", x.bugs && "🦟 bugs", x.dew && "💧 dew"].filter(Boolean).join(" · ")}</div></div>`; }).join("")}</div></div>`;
}
go(pt);
