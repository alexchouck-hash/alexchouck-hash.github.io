import { RESORTS, REGIONS, AIRPORTS, TOURISM, CLEANUP } from "./resorts.js";
import { iso, parseISO, addDays, doy, DAY, buildDay, sargassum, crowds, normalsFromArchive, fallbackSstF, SARG_LEVELS, CROWD_LEVELS, level, WMO, uvCategory } from "./model.js";
import * as api from "./api.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = Object.fromEntries(RESORTS.map((r) => [r.id, r]));
const now = new Date();
const TODAY = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
const MAX = addDays(TODAY, 365);

const state = { id: "lodge-gsp", date: iso(TODAY), tab: "overview", metric: "sargassum", data: {}, overview: null };
const cache = state.data;

// ---------- URL state ----------
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (byId[p.get("resort")]) state.id = p.get("resort");
  const d = p.get("date");
  if (d && parseISO(d) >= TODAY && parseISO(d) <= MAX) state.date = d;
  if (p.get("tab")) state.tab = p.get("tab");
}
const writeHash = () => history.replaceState(null, "", `#resort=${state.id}&date=${state.date}&tab=${state.tab}`);

// ---------- controls ----------
function setupControls() {
  const sel = $("#resort");
  for (const [key, reg] of Object.entries(REGIONS)) {
    const g = document.createElement("optgroup"); g.label = reg.name;
    RESORTS.filter((r) => r.region === key).forEach((r) => g.append(new Option(`${r.name} (${r.city})`, r.id)));
    sel.append(g);
  }
  sel.value = state.id;
  sel.onchange = () => selectResort(sel.value, true);
  const di = $("#date");
  di.min = iso(TODAY); di.max = iso(MAX); di.value = state.date;
  di.onchange = () => { if (di.value) setDate(di.value); };
  document.querySelectorAll("[data-jump]").forEach((b) => (b.onclick = () => setDate(iso(addDays(TODAY, +b.dataset.jump)))));
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); }));
  $("#mapmetric").onchange = (e) => { state.metric = e.target.value; paintMap(); };
}
function setDate(d) {
  const t = parseISO(d);
  state.date = iso(t < TODAY ? TODAY : t > MAX ? MAX : t);
  $("#date").value = state.date;
  render(); paintMap();
}

// ---------- map ----------
let map, markers = {};
function setupMap() {
  map = L.map("map", { zoomControl: true }).setView([24.5, -89.5], 5);
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
  const y = iso(addDays(TODAY, -1));
  const sat = L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${y}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, { maxZoom: 9, attribution: "NASA GIBS / MODIS Terra" });
  L.control.layers({ "Street map": osm, [`Satellite (MODIS, ${y})`]: sat }).addTo(map);
  for (const r of RESORTS) {
    markers[r.id] = L.circleMarker([r.lat, r.lon], { radius: 8, weight: 2, color: "#fff", fillOpacity: 0.95 })
      .addTo(map).on("click", () => selectResort(r.id, false));
  }
}
function overviewFor(r, d) {
  const o = state.overview; if (!o) return {};
  const i = RESORTS.indexOf(r); const k = iso(d);
  const w = o.weather[i], m = o.marine[i];
  const wi = w?.daily?.time.indexOf(k) ?? -1, mi = m?.daily?.time.indexOf(k) ?? -1;
  return {
    windDir: wi >= 0 ? w.daily.wind_direction_10m_dominant[wi] : null, windMph: wi >= 0 ? w.daily.wind_speed_10m_max[wi] : null,
    tmaxF: wi >= 0 ? Math.round(w.daily.temperature_2m_max[wi]) : null,
    sstF: k === iso(TODAY) && m?.current?.sea_surface_temperature != null ? Math.round(m.current.sea_surface_temperature * 1.8 + 32) : null,
  };
}
const TEMP_LEVELS = [[60, "<60°", "#3b6fb6"], [70, "60s", "#4fa3c7"], [80, "70s", "#8bbf3f"], [90, "80s", "#e3b52a"], [200, "90+", "#e0772b"]];
function paintMap() {
  const d = parseISO(state.date);
  const daysOut = Math.round((d - TODAY) / DAY);
  const legends = { sargassum: SARG_LEVELS, crowd: CROWD_LEVELS, temp: TEMP_LEVELS, water: TEMP_LEVELS };
  for (const r of RESORTS) {
    const o = overviewFor(r, d);
    let val, color, text;
    if (state.metric === "sargassum") {
      const s = sargassum(r, d, { ...o, daysOut }); val = s.score; color = s.color; text = `Sargassum ${s.label} (${s.score})`;
    } else if (state.metric === "crowd") {
      const c = crowds(r, d).resort; color = c.color; text = `Crowds ${c.label}`;
    } else if (state.metric === "temp") {
      const n = cache[r.id]?.normals?.[doy(d)];
      val = o.tmaxF ?? n?.tmaxF; color = val != null ? level(val, TEMP_LEVELS)[2] : "#999"; text = val != null ? `High ${val}°F` : "Open resort to load climate outlook";
    } else {
      val = o.sstF ?? cache[r.id]?.normals?.[doy(d)]?.sstF ?? fallbackSstF(r, d); color = level(val, TEMP_LEVELS)[2]; text = `Water ~${val}°F`;
    }
    const m = markers[r.id];
    m.setStyle({ fillColor: color, radius: r.id === state.id ? 12 : 8, weight: r.id === state.id ? 3 : 2, color: r.id === state.id ? "#14212b" : "#fff" });
    m.bindTooltip(`<b>${esc(r.name)}</b><br>${esc(r.city)}<br>${esc(text)}`);
  }
  $("#legend").innerHTML = legends[state.metric].map(([, l, c]) => `<span style="--c:${c}">${l}</span>`).join("");
}

// ---------- data loading ----------
async function selectResort(id, pan) {
  state.id = id; $("#resort").value = id;
  const r = byId[id];
  if (pan) map.flyTo([r.lat, r.lon], 9, { duration: 0.8 });
  paintMap(); render();
  await loadResort(id);
}
async function loadResort(id, force = false) {
  const r = byId[id];
  const c = (cache[id] ||= {});
  const jobs = [];
  if (force || !c.fc) jobs.push(api.forecast(r.lat, r.lon).then((v) => (c.fc = v)).catch((e) => (c.fcErr = e.message)));
  if (force || !c.mar) jobs.push(api.marine(...api.marinePoint(r)).then((v) => (c.mar = v)).catch((e) => (c.marErr = e.message)));
  if (!c.alerts && REGIONS[r.region].country === "US") jobs.push(api.nwsAlerts(r.lat, r.lon).then((v) => (c.alerts = v)).catch(() => (c.alerts = [])));
  if (!c.normals) jobs.push(loadNormals(r).then((v) => (c.normals = v)).catch((e) => (c.normErr = e.message)));
  // re-render as each piece arrives
  jobs.forEach((j) => j.then(() => { if (state.id === id) { render(); paintMap(); } }));
  await Promise.allSettled(jobs);
  c.loadedAt = new Date();
  if (state.id === id) render();
}
async function loadNormals(r) {
  const key = "gsf:normals:v2:" + r.id;
  try {
    const hit = JSON.parse(localStorage.getItem(key) || "null");
    if (hit && Date.now() - hit.t < 30 * DAY) return hit.v;
  } catch {}
  const h = await api.history(r.lat, r.lon, api.marinePoint(r));
  const v = normalsFromArchive(h.daily, h.marine);
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}

// ---------- day record ----------
function day(r, d) {
  const c = cache[r.id] || {};
  const k = iso(d);
  return buildDay(r, d, TODAY, { fc: c.fc?.days[k] || null, marine: c.mar?.days[k] || null, nm: c.normals?.[doy(d)] || null });
}

// ---------- rendering helpers ----------
const chip = (label, color) => `<span class="chip" style="--c:${color}">${esc(label)}</span>`;
const stat = (k, v, d = "", pct = null, color = "") => `<div class="stat"><div class="k">${k}</div><div class="v">${v ?? "—"}</div><div class="d">${d}</div>${pct != null ? `<div class="meter"><i style="width:${pct}%;--c:${color}"></i></div>` : ""}</div>`;
const compass = (deg) => deg == null ? "" : ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(deg / 22.5) % 16];
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const srcNote = (rec) => rec.source === "forecast" ? `<span class="chip soft">Forecast · ${rec.daysOut} day${rec.daysOut === 1 ? "" : "s"} out</span>` : `<span class="chip soft">Climate outlook · ${rec.daysOut} days out</span>`;

function render() {
  writeHash();
  const r = byId[state.id], d = parseISO(state.date), c = cache[r.id] || {}, rec = day(r, d);
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  $("#head").innerHTML = `<h2>${esc(r.name)}</h2><div class="muted">${esc(r.city)} · ${esc(REGIONS[r.region].name)} · Airports: ${r.airports.join(", ")}</div>
    <div style="margin-top:6px">${fmtDate(d)} ${srcNote(rec)} ${rec.holidays.map((h) => `<span class="chip soft">${esc(h)}</span>`).join(" ")}</div>`;
  $("#now").innerHTML = renderNow(r, c);
  $("#tab").innerHTML = (TABS[state.tab] || TABS.overview)(r, d, rec, c);
  $("#tab").querySelectorAll("[data-date]").forEach((el) => (el.onclick = () => setDate(el.dataset.date)));
  const dl = $("#tab").querySelector("[data-download]");
  if (dl) dl.onclick = () => download(r, dl.dataset.download);
  renderYear(r, d);
}

function renderNow(r, c) {
  const cur = c.fc?.current, m = c.mar?.current;
  if (!cur) return `<h3>Current conditions</h3><p class="muted">${c.fcErr ? "Live data unavailable: " + esc(c.fcErr) : "Loading live conditions…"}</p>`;
  const [desc, icon] = WMO[cur.weather_code] || ["", ""];
  const alerts = (c.alerts || []).slice(0, 4).map((a) => `<div class="alert"><b>${esc(a.event)}</b>: ${esc(a.headline || "")}</div>`).join("");
  return `<h3>Current conditions <span class="muted small">· updated ${esc(cur.time.replace("T", " "))} local · refreshes every 10 min</span></h3>
    <div class="row"><span class="big">${icon} ${Math.round(cur.temperature_2m)}°F</span>
    <span>${esc(desc)} · feels ${Math.round(cur.apparent_temperature)}°F · humidity ${cur.relative_humidity_2m}%</span></div>
    <div class="grid" style="margin-top:8px">
      ${stat("Wind", `${Math.round(cur.wind_speed_10m)} mph`, `${compass(cur.wind_direction_10m)}, gusts ${Math.round(cur.wind_gusts_10m)}`)}
      ${stat("UV index", cur.uv_index?.toFixed(1), uvCategory(cur.uv_index) || "")}
      ${stat("Cloud cover", `${cur.cloud_cover}%`, cur.precipitation > 0 ? `Rain ${cur.precipitation}" last hr` : "No rain now")}
      ${stat("Water temp", m?.sstF != null ? `${m.sstF}°F` : "—", "Sea surface")}
      ${stat("Waves", m?.waveFt != null ? `${m.waveFt} ft` : "—", m?.periodS ? `${m.periodS}s period, from ${compass(m.waveDir)}` : "")}
    </div>${alerts || (REGIONS[r.region].country === "US" ? `<p class="muted small" style="margin:8px 0 0">No active NWS alerts.</p>` : "")}`;
}

// ---------- tabs ----------
const TABS = {
  overview(r, d, rec) {
    const s = rec.sargassum, w = rec.weather, o = rec.ocean, cr = rec.crowds, sf = rec.safety;
    return `<div class="grid">
      ${stat("Sargassum risk", chip(s.label, s.color), `Score ${s.score}/100 · after cleanup: ${s.beachAfterCleanupLabel}`, s.score, s.color)}
      ${stat("Weather", `${w.icon} ${w.tmaxF ?? "—"}° / ${w.tminF ?? "—"}°`, esc(w.summary))}
      ${stat("Rain chance", w.precipProb != null ? w.precipProb + "%" : "—", w.precipIn != null ? `${w.precipIn}" ${rec.source === "forecast" ? "expected" : "typical"}` : "")}
      ${stat("Cloud cover", w.cloud != null ? w.cloud + "%" : "—", rec.source === "forecast" ? "Daily mean" : "Typical for date")}
      ${stat("UV index", sf.uv?.index ?? "—", sf.uv?.category ?? "")}
      ${stat("Water temp", o.sstF != null ? o.sstF + "°F" : "—", o.source === "forecast" ? "Forecast" : "Typical for date")}
      ${stat("Waves", o.waveFt != null ? o.waveFt + " ft" : "—", sf.ripCurrent ? `Rip risk: ${sf.ripCurrent.label}` : "")}
      ${stat("Resort crowds", chip(cr.resort.label, cr.resort.color), "", cr.resort.score, cr.resort.color)}
      ${stat("Airport", chip(cr.airport.label, cr.airport.color), esc(r.airports[0]), cr.airport.score, cr.airport.color)}
      ${stat("City / area", chip(cr.city.label, cr.city.color), "", cr.city.score, cr.city.color)}
      ${stat("Tropical risk", sf.tropical.pct + "%", esc(sf.tropical.label))}
      ${stat("Heat index", sf.heatIndexF != null ? sf.heatIndexF + "°F" : "—", esc(sf.heat || ""))}
    </div>
    ${sf.actions.length ? `<div class="card"><h3>Heads-up for this date</h3><ul class="clean">${sf.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
    ${forecastStrip(r, d)}`;
  },

  sargassum(r, d, rec) {
    const s = rec.sargassum, cl = s.cleanup;
    const weeks = Array.from({ length: 12 }, (_, i) => { const dd = addDays(d, i * 7); return dd <= MAX ? [dd, sargassum(r, dd, {})] : null; }).filter(Boolean);
    return `<div class="card"><h3>Sargassum outlook</h3>
      <div class="grid">
        ${stat("Arrival risk", chip(s.label, s.color), `Score ${s.score}/100`, s.score, s.color)}
        ${stat("Seasonal baseline", s.seasonal + "%", "Basin seasonality")}
        ${stat("Beach after cleanup", s.beachAfterCleanupLabel, `~${s.beachAfterCleanup}/100 by morning`)}
        ${stat("Onshore wind", s.onshoreWind == null ? "n/a" : s.onshoreWind ? "Yes" : "No", s.windAdjusted ? "Wind-adjusted" : "Beyond wind forecast")}
      </div>
      <p class="small muted">Confidence: ${esc(s.confidence)}. ${esc(s.smellRisk)}. Exposure factor for this beach: ${Math.round(r.exposure * 100)}% (faces ${compass(r.facing)}).</p></div>
      <div class="card"><h3>Barriers & cleanup</h3>
      <table><tr><th>Offshore barriers</th><td>${esc(cl.barriers)}</td></tr><tr><th>Public cleanup</th><td>${esc(cl.cleanup)}</td></tr><tr><th>Resort crews</th><td>${esc(cl.resort)}</td></tr><tr><th>Typical clearing time</th><td>${esc(cl.speed)}</td></tr></table>
      <p class="small muted">Programs change year to year. Confirm with the resort before booking during peak season.</p></div>
      <div class="card"><h3>Next 12 weeks</h3><table><tr><th>Week of</th><th>Risk</th><th>Score</th></tr>
      ${weeks.map(([dd, x]) => `<tr data-date="${iso(dd)}" style="cursor:pointer"><td>${dd.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</td><td>${chip(x.label, x.color)}</td><td>${x.score}</td></tr>`).join("")}</table></div>
      <div class="card small"><h3>Official sources</h3><ul class="clean">
        <li><a href="https://optics.marine.usf.edu/projects/SaWS.html" target="_blank" rel="noopener">USF Sargassum Watch (SaWS) monthly outlook</a></li>
        <li><a href="https://cwcgom.aoml.noaa.gov/SIR/" target="_blank" rel="noopener">NOAA AOML Sargassum Inundation Risk</a></li>
        ${r.region.startsWith("mx") ? `<li><a href="https://www.gob.mx/semar" target="_blank" rel="noopener">SEMAR (Mexican Navy) sargassum reports</a> · <a href="https://www.facebook.com/RedDeMonitoreoDelSargazoDeQuintanaRoo" target="_blank" rel="noopener">Red de Monitoreo del Sargazo QRoo</a></li>` : ""}
        <li>Map layer "Satellite (MODIS)" can show large mats on clear days.</li></ul></div>`;
  },

  weather(r, d, rec, c) {
    const w = rec.weather;
    const hourly = rec.daysOut <= 15 && c.fc ? hourlyTable(c.fc.hourly, state.date) : "";
    return `<div class="card"><h3>${w.icon} ${esc(w.summary)}</h3><div class="grid">
      ${stat("High / Low", `${w.tmaxF ?? "—"}° / ${w.tminF ?? "—"}°`, w.feelsF ? `Feels like ${w.feelsF}°` : "")}
      ${stat("Rain chance", w.precipProb != null ? w.precipProb + "%" : "—", w.precipIn != null ? w.precipIn + '" rain' : "")}
      ${stat("Clouds", w.cloud != null ? w.cloud + "%" : "—", "")}
      ${stat("Thunder", w.thunderPct != null ? w.thunderPct + "%" : "—", rec.source === "forecast" ? "From forecast" : "Share of past years")}
      ${stat("Wind", w.windMph != null ? w.windMph + " mph" : "—", w.windDir != null ? "from " + compass(w.windDir) : "")}
      ${stat("Humidity", w.rh != null ? w.rh + "%" : "—", "")}
      ${stat("UV max", w.uv != null ? w.uv : "—", uvCategory(w.uv) || "")}
      ${w.sunrise ? stat("Sun", w.sunrise, "set " + w.sunset) : ""}
    </div>
    <p class="small muted">${rec.source === "forecast" ? "Day-specific forecast from Open-Meteo (blend of NOAA GFS/HRRR, ECMWF and others)." : "More than 16 days out, no model can forecast a specific day. These are 10-year ERA5 normals for this date (±5 days), which is the most reliable long-range guidance."}</p></div>
    ${hourly}${forecastStrip(r, d)}`;
  },

  ocean(r, d, rec, c) {
    const o = rec.ocean, rip = rec.safety.ripCurrent;
    const days = c.mar ? Object.entries(c.mar.days) : [];
    return `<div class="card"><h3>Water & waves</h3><div class="grid">
      ${stat("Water temp", o.sstF != null ? o.sstF + "°F" : "—", o.source === "forecast" ? "Forecast" : "Typical for date")}
      ${stat("Wave height", o.waveFt != null ? o.waveFt + " ft" : "—", o.source === "forecast" ? "Max for day" : "Typical max")}
      ${stat("Period", o.periodS ? o.periodS + " s" : "—", o.waveDir != null ? "from " + compass(o.waveDir) : "")}
      ${stat("Swell", o.swellFt != null ? o.swellFt + " ft" : "—", "")}
      ${stat("Rip current", rip ? rip.label : "—", rip ? `Likely flag: ${rip.flag}` : "")}
    </div></div>
    ${days.length ? `<div class="card"><h3>8-day marine forecast</h3><table><tr><th>Date</th><th>Waves</th><th>Period</th><th>Swell</th><th>Water</th></tr>
      ${days.map(([k, v]) => `<tr data-date="${k}" style="cursor:pointer"><td>${k.slice(5)}</td><td>${v.waveFt ?? "—"} ft</td><td>${v.periodS ?? "—"} s</td><td>${v.swellFt ?? "—"} ft</td><td>${v.sstF ?? "—"}°F</td></tr>`).join("")}</table></div>` : ""}
    <p class="small muted">Buoys: <a href="https://www.ndbc.noaa.gov/obs.shtml?lat=${r.lat}&lon=${r.lon}&zoom=8" target="_blank" rel="noopener">nearest NOAA NDBC stations</a> · <a href="https://www.weather.gov/safety/ripcurrent-forecasts" target="_blank" rel="noopener">NWS surf zone forecasts</a></p>`;
  },

  crowds(r, d, rec) {
    const cr = rec.crowds;
    const next = Array.from({ length: 14 }, (_, i) => addDays(d, i)).filter((x) => x <= MAX);
    return `<div class="grid">
      ${stat("Resort & beach", chip(cr.resort.label, cr.resort.color), `${cr.resort.score}/100`, cr.resort.score, cr.resort.color)}
      ${stat(`Airport (${r.airports.join("/")})`, chip(cr.airport.label, cr.airport.color), `${cr.airport.score}/100`, cr.airport.score, cr.airport.color)}
      ${stat(esc(r.city.split(",")[0]), chip(cr.city.label, cr.city.color), `${cr.city.score}/100`, cr.city.score, cr.city.color)}
    </div>
    <div class="card"><p style="margin:0">${esc(cr.airport.tip)}.</p>${cr.drivers.length ? `<p class="small muted">Drivers: ${cr.drivers.map(esc).join(", ")}</p>` : ""}</div>
    <div class="card"><h3>Next 14 days</h3><table><tr><th>Date</th><th>Resort</th><th>Airport</th><th>City</th></tr>
      ${next.map((x) => { const q = crowds(r, x); return `<tr data-date="${iso(x)}" style="cursor:pointer"><td>${x.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</td><td>${chip(q.resort.label, q.resort.color)}</td><td>${chip(q.airport.label, q.airport.color)}</td><td>${chip(q.city.label, q.city.color)}</td></tr>`; }).join("")}</table>
    <p class="small muted">Modeled from seasonal visitation patterns, US and Mexican school/holiday calendars, spring break, day-of-week travel patterns and local events. Not live counts.</p></div>`;
  },

  safety(r, d, rec) {
    const sf = rec.safety;
    return `<div class="grid">
      ${stat("Rip current", sf.ripCurrent?.label ?? "—", sf.ripCurrent ? `Likely flag: ${sf.ripCurrent.flag}` : "Wave data loading")}
      ${stat("UV", sf.uv?.index ?? "—", sf.uv?.category ?? "")}
      ${stat("Heat index", sf.heatIndexF != null ? sf.heatIndexF + "°F" : "—", esc(sf.heat || ""))}
      ${stat("Tropical risk", sf.tropical.pct + "%", esc(sf.tropical.label))}
    </div>
    <div class="card"><h3>Travel advisory</h3><p style="margin:0">${esc(sf.travelAdvisory)}</p>
      <p class="small muted">Verify at <a href="https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html" target="_blank" rel="noopener">travel.state.gov</a>.</p></div>
    <div class="card"><h3>Local hazards</h3><ul class="clean">${sf.local.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${sf.actions.length ? `<h3 style="margin-top:10px">For ${esc(state.date)}</h3><ul class="clean">${sf.actions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
    <div class="card small"><h3>Live safety sources</h3><ul class="clean">
      <li><a href="https://www.nhc.noaa.gov/" target="_blank" rel="noopener">National Hurricane Center</a></li>
      ${REGIONS[r.region].country === "US" ? `<li><a href="https://forecast.weather.gov/MapClick.php?lat=${r.lat}&lon=${r.lon}" target="_blank" rel="noopener">NWS point forecast & hazards</a></li><li><a href="https://myfwc.com/research/redtide/statewide/" target="_blank" rel="noopener">FWC red tide status (FL)</a></li>` : `<li><a href="https://smn.conagua.gob.mx/" target="_blank" rel="noopener">SMN Mexico weather service</a></li>`}
      <li>Beach flags: Green low · Yellow medium · Red high · Double red water closed · Purple marine pests</li></ul></div>`;
  },

  area(r) {
    const nearby = RESORTS.filter((x) => x.region === r.region && x.id !== r.id);
    return `<div class="card"><h3>Things to do near ${esc(r.city)}</h3><ul class="clean">${TOURISM[r.region].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="card"><h3>Airports</h3><table>${r.airports.map((a) => { const [n, la, lo] = AIRPORTS[a]; const mi = Math.round(dist(r.lat, r.lon, la, lo)); return `<tr><td><b>${a}</b></td><td>${esc(n)}</td><td>${mi} mi</td></tr>`; }).join("")}</table></div>
    ${nearby.length ? `<div class="card"><h3>Other resorts in ${esc(REGIONS[r.region].name)}</h3><ul class="clean">${nearby.map((x) => `<li><a href="#resort=${x.id}&date=${state.date}" data-resort="${x.id}">${esc(x.name)}</a> · ${esc(x.city)}</li>`).join("")}</ul></div>` : ""}
    <div class="card small"><h3>Cleanup & beach programs</h3><p style="margin:0">${esc(CLEANUP[r.region].cleanup)}</p></div>`;
  },

  data(r) {
    const base = location.origin + location.pathname.replace(/index\.html$/, "");
    return `<div class="card"><h3>Download this resort</h3>
      <p>Full 365-day dataset (sargassum, weather/climate, water, waves, UV, crowds, safety) as generated in your browser right now.</p>
      <button data-download="json">Download JSON</button> <button data-download="csv">Download CSV</button></div>
    <div class="card"><h3>JSON data feed</h3>
      <p class="small">A GitHub Action rebuilds a static JSON feed for every resort every 3 hours. No key needed.</p>
      <pre>GET ${esc(base)}data/index.json
GET ${esc(base)}data/resorts/${esc(r.id)}.json</pre>
      <p class="small">Each resort file contains <code>current</code> (live conditions), <code>days[]</code> for the next 365 days (16-day forecast, then climate outlook) and <code>meta</code>. See <a href="data/README.md">field reference</a>.</p></div>`;
  },
};

function forecastStrip(r, d) {
  const days = Array.from({ length: 16 }, (_, i) => addDays(TODAY, i));
  return `<div class="card"><h3>16-day forecast</h3><div class="strip">${days.map((x) => {
    const q = day(r, x); const w = q.weather;
    return `<div class="day ${iso(x) === state.date ? "sel" : ""}" data-date="${iso(x)}">${x.toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" })}<b>${w.icon || ""} ${w.tmaxF ?? "—"}°</b>${w.precipProb ?? "—"}% 💧<br><span style="color:${q.sargassum.color}">● ${q.sargassum.label}</span></div>`;
  }).join("")}</div></div>`;
}

function hourlyTable(h, date) {
  const rows = h.time.map((t, i) => [t, i]).filter(([t]) => t.startsWith(date) && +t.slice(11, 13) % 3 === 0);
  if (!rows.length) return "";
  return `<div class="card"><h3>Every 3 hours</h3><table><tr><th>Time</th><th>Temp</th><th>Rain %</th><th>Cloud</th><th>UV</th><th>Wind</th></tr>
    ${rows.map(([t, i]) => `<tr><td>${t.slice(11)}</td><td>${Math.round(h.temperature_2m[i])}°</td><td>${h.precipitation_probability[i] ?? "—"}%</td><td>${h.cloud_cover[i]}%</td><td>${h.uv_index[i] ?? "—"}</td><td>${Math.round(h.wind_speed_10m[i])} mph</td></tr>`).join("")}</table></div>`;
}

// ---------- year chart ----------
function renderYear(r, sel) {
  const W = 720, H = 200, P = { l: 30, r: 10, t: 10, b: 24 };
  const pts = Array.from({ length: 366 }, (_, i) => { const d = addDays(TODAY, i); return [d, day(r, d)]; });
  pts.forEach(([, q], i) => { const w = pts.slice(Math.max(0, i - 3), i + 4); q.crowdWeek = w.reduce((a, [, z]) => a + z.crowds.resort.score, 0) / w.length; });
  const x = (i) => P.l + (i / 365) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const line = (f, color, dash = "") => {
    let s = "", pen = false;
    pts.forEach(([, q], i) => { const v = f(q); if (v == null) { pen = false; return; } s += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(Math.max(0, Math.min(100, v))).toFixed(1)}`; pen = true; });
    return `<path d="${s}" fill="none" stroke="${color}" stroke-width="1.8" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
  };
  const months = pts.filter(([d]) => d.getUTCDate() === 1).map(([d]) => { const i = Math.round((d - TODAY) / DAY); return `<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--line)"/><text x="${x(i) + 2}" y="${H - 8}" font-size="10" fill="var(--muted)">${d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}</text>`; }).join("");
  const si = Math.round((sel - TODAY) / DAY);
  const grid = [0, 50, 100].map((v) => `<text x="2" y="${y(v) + 3}" font-size="10" fill="var(--muted)">${v}</text>`).join("");
  const series = [
    [(q) => q.sargassum.score, "#c8372d", "", "Sargassum risk"],
    [(q) => q.crowdWeek, "#6b4fbb", "", "Resort crowds (7-day avg)"],
    [(q) => q.weather.tmaxF, "#e0772b", "4 3", "High °F"],
    [(q) => q.weather.precipProb, "#0d7ea8", "2 2", "Rain chance %"],
    [(q) => q.ocean.sstF, "#2e9e6b", "6 2", "Water °F"],
  ];
  $("#year").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="12-month outlook">${grid}${months}
    <rect x="${x(16)}" y="${P.t}" width="0.5" height="${H - P.t - P.b}" fill="var(--muted)"/><text x="${x(16) + 3}" y="${P.t + 9}" font-size="9" fill="var(--muted)">← forecast | climate outlook →</text>
    ${series.map(([f, c, dsh]) => line(f, c, dsh)).join("")}
    <line x1="${x(si)}" x2="${x(si)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--ink)" stroke-width="1.5"/></svg>
    <div class="lg">${series.map(([, c, , n]) => `<span style="--c:${c}">${n}</span>`).join("")}</div>`;
  const svg = $("#year svg");
  svg.onclick = (e) => {
    const b = svg.getBoundingClientRect();
    const i = Math.round((((e.clientX - b.left) / b.width) * W - P.l) / (W - P.l - P.r) * 365);
    setDate(iso(addDays(TODAY, Math.max(0, Math.min(365, i)))));
  };
}

// ---------- export ----------
function dataset(r) {
  return Array.from({ length: 366 }, (_, i) => day(r, addDays(TODAY, i)));
}
function download(r, kind) {
  const rows = dataset(r);
  let blob;
  if (kind === "json") blob = new Blob([JSON.stringify({ resort: r, generated: new Date().toISOString(), current: { weather: cache[r.id]?.fc?.current, marine: cache[r.id]?.mar?.current }, days: rows }, null, 2)], { type: "application/json" });
  else {
    const head = ["date", "source", "sargassum_score", "sargassum_level", "tmax_f", "tmin_f", "precip_prob", "precip_in", "cloud_pct", "uv", "wind_mph", "water_f", "wave_ft", "rip_risk", "crowd_resort", "crowd_airport", "crowd_city", "tropical_pct", "holidays"];
    const lines = rows.map((q) => [q.date, q.source, q.sargassum.score, q.sargassum.label, q.weather.tmaxF, q.weather.tminF, q.weather.precipProb, q.weather.precipIn, q.weather.cloud, q.weather.uv, q.weather.windMph, q.ocean.sstF, q.ocean.waveFt, q.safety.ripCurrent?.label, q.crowds.resort.score, q.crowds.airport.score, q.crowds.city.score, q.safety.tropical.pct, q.holidays.join("; ")].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${r.id}-forecast.${kind}` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function dist(a, b, c, d) {
  const R = 3959, t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- boot ----------
readHash();
setupControls();
setupMap();
document.addEventListener("click", (e) => { const a = e.target.closest("[data-resort]"); if (a) { e.preventDefault(); selectResort(a.dataset.resort, true); } });
render(); paintMap();
api.overview(RESORTS).then((o) => { state.overview = o; paintMap(); }).catch(() => {});
selectResort(state.id, true);
setInterval(() => { loadResort(state.id, true); api.overview(RESORTS).then((o) => { state.overview = o; paintMap(); }).catch(() => {}); }, 10 * 60 * 1000);
