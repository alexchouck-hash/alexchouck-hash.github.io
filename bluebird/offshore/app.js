import { header, $, esc, getJSON, temp, speed, len, units, unitToggle, dayLabel, gradePill, grade, moon, baseMap, hashPoint, setHashPoint } from "../assets/shared.js";
import { BOATS, days, tempBreak } from "./model.js";

header("offshore");
const SPOTS = [["Florida Keys (Gulf Stream)", [24.35, -80.9]], ["Palm Beach, FL", [26.7, -79.95]], ["Outer Banks, NC", [35.3, -75.2]], ["Montauk, NY", [40.95, -71.8]],
  ["Venice, LA", [28.8, -89.1]], ["Port Aransas, TX", [27.7, -96.9]], ["Cabo San Lucas, MX", [22.75, -109.9]], ["San Diego, CA", [32.6, -117.5]],
  ["Kona, HI", [19.6, -156.1]], ["Bermuda", [32.2, -64.9]], ["Costa Rica (Los Sueños)", [9.5, -84.8]], ["Great Barrier Reef, AU", [-16.5, 146.2]]];
let pt = hashPoint(SPOTS[0][1]), boat = "small", cache = null;
const map = baseMap("map", pt, 7);
const marker = L.marker(pt).addTo(map);
$("#boat").innerHTML = Object.entries(BOATS).map(([k, b]) => `<option value="${k}">${b.label}</option>`).join("");
$("#boat").onchange = (e) => { boat = e.target.value; render(); };
$("#jump").innerHTML = `<option value="">Choose…</option>` + SPOTS.map(([n], k) => `<option value="${k}">${esc(n)}</option>`).join("");
$("#jump").onchange = (e) => { const s = SPOTS[e.target.value]; if (s) { map.setView(s[1], 7); go(s[1]); } };
$("#units").append(unitToggle(() => render()));
map.on("click", (e) => go([e.latlng.lat, e.latlng.lng]));

async function go(p) {
  pt = p; marker.setLatLng(p); setHashPoint(p); cache = null;
  $("#status").textContent = "Loading marine forecast…"; $("#status").classList.remove("err");
  const [lat, lon] = p, d = 0.25;
  const ring = [[lat + d, lon], [lat - d, lon], [lat, lon + d], [lat, lon - d]];
  try {
    const [m, w, n] = await Promise.all([
      getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,swell_wave_height,swell_wave_period,sea_surface_temperature,ocean_current_velocity&forecast_days=7&timezone=auto`, 30),
      getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,cape&daily=sunrise,sunset&forecast_days=7&timezone=auto`, 30),
      getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${ring.map((x) => x[0]).join(",")}&longitude=${ring.map((x) => x[1]).join(",")}&current=sea_surface_temperature`, 60).catch(() => null),
    ]);
    if (pt !== p) return;
    if (!m.hourly?.wave_height?.some((v) => v != null)) throw new Error("no wave data here (on land or too close to shore?)");
    const byT = Object.fromEntries(w.hourly.time.map((t, i) => [t, i]));
    const h = { time: m.hourly.time, wave: m.hourly.wave_height, period: m.hourly.wave_period, sst: m.hourly.sea_surface_temperature, swell: m.hourly.swell_wave_height, swellP: m.hourly.swell_wave_period };
    for (const [k, v] of [["wind", "wind_speed_10m"], ["gust", "wind_gusts_10m"], ["pop", "precipitation_probability"], ["cape", "cape"]]) h[k] = h.time.map((t) => w.hourly[v][byT[t]] ?? null);
    const sstNow = h.sst.find((v) => v != null);
    const brk = n ? tempBreak(sstNow, (Array.isArray(n) ? n : [n]).map((x) => x.current?.sea_surface_temperature)) : null;
    cache = { h, brk, sun: w.daily };
    $("#status").textContent = ""; render();
  } catch (e) { $("#status").textContent = `Could not load: ${e.message}`; $("#status").classList.add("err"); $("#out").innerHTML = ""; }
}

function render() {
  if (!cache) return;
  const { h, brk, sun } = cache, ds = days(boat, h), now = ds[0];
  const i0 = h.time.findIndex((t) => Date.parse(t) >= Date.now() - 36e5);
  const best = [...ds].sort((a, b) => b.score - a.score)[0];
  $("#out").innerHTML = `<div class="card"><h2>${pt[0].toFixed(2)}°, ${pt[1].toFixed(2)}°</h2>
    <div class="small muted">${BOATS[boat].label} boat · best day: ${best ? `${dayLabel(best.date)} (${grade(best.score).label.toLowerCase()})` : "–"}</div>
    <div class="kpis">
      <div class="kpi"><b>${len(h.wave[i0])}</b><span>Seas now @ ${h.period[i0]?.toFixed(0) ?? "–"} s</span></div>
      <div class="kpi"><b>${speed(h.wind[i0])}</b><span>Wind now (gusts ${speed(h.gust[i0])})</span></div>
      <div class="kpi"><b>${temp(h.sst[i0])}</b><span>Water temperature</span></div>
      <div class="kpi"><b>${brk == null ? "–" : units.us ? `${(brk * 1.8).toFixed(1)} °F` : `${brk} °C`}</b><span>${brk >= 1 ? "Temperature break nearby" : "Temp change within 25 km"}</span></div>
    </div>
    <div class="days">${ds.map((d, k) => { const mo = moon(new Date(d.date + "T12:00Z")); return `<div class="day"><b>${dayLabel(d.date)}</b><div class="score">${d.score}</div>${gradePill(d.score)}
      <div>Seas to ${len(d.maxWave)}</div><div>Wind to ${speed(d.maxWind)}</div>${d.storm ? `<div style="color:var(--bad)">⚡ Storm risk</div>` : ""}
      <div class="muted">${mo.icon} ${sun.sunrise[k] ? "Sunrise " + sun.sunrise[k].slice(11) : ""}</div></div>`; }).join("")}</div>
    <p class="note">Swell now: ${len(h.swell[i0])} @ ${h.swellP[i0]?.toFixed(0) ?? "–"} s. Moon: ${moon().name.toLowerCase()} (${Math.round(moon().illum * 100)}% lit).</p></div>`;
}
go(pt);
