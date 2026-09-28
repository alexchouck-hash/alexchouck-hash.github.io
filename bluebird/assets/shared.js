// Bluebird shared helpers: partner-site nav, cached fetch, units, dates, scores, moon.
export const SITES = [
  { id: "snow", name: "Snow", icon: "❄️", href: "../../ski-conditions/", color: "#1f6feb", blurb: "Run-by-run snow conditions at 140+ major ski resorts, verified against snow stations." },
  { id: "beach", name: "Beach", icon: "🏝️", href: "../../", color: "#0d9bb5", blurb: "Sargassum, water, waves and crowds at 440+ Gulf and Caribbean resorts." },
  { id: "foliage", name: "Foliage", icon: "🍁", href: "../foliage/", color: "#d4622a", blurb: "When fall color peaks at 40 famous leaf-peeping spots, from this year's weather." },
  { id: "rivers", name: "Rivers", icon: "🛶", href: "../rivers/", color: "#1f8f8a", blurb: "Live river levels for canoeing and kayaking, compared with what is normal for the day." },
  { id: "waterfalls", name: "Waterfalls", icon: "💧", href: "../waterfalls/", color: "#2d6fb8", blurb: "How hard 34 famous waterfalls are flowing now, from recent rain, snowmelt season and the forecast." },
  { id: "offshore", name: "Offshore", icon: "🎣", href: "../offshore/", color: "#27509b", blurb: "Go/no-go sea conditions, temperature breaks and moon for offshore fishing." },
  { id: "camp", name: "Camp", icon: "⛺", href: "../camp/", color: "#3e7d3a", blurb: "Night-by-night camping forecast: dry, calm, comfortable, bugs and stars." },
];

// Header with logo and links to every partner site. `here` = current site id.
export function header(here, root = "..") {
  const el = document.createElement("header");
  el.className = "bb-top";
  const fix = (h) => h.replace(/^\.\.\//, root + "/");
  el.innerHTML = `<a class="bb-brand" href="${root}/"><img src="${root}/assets/logo.svg" alt=""><b>Bluebird</b>${here ? `<span>${SITES.find((s) => s.id === here)?.name}</span>` : ""}</a>
    <nav class="bb-nav" aria-label="Bluebird sites">${SITES.map((s) => `<a href="${fix(s.href)}" class="${s.id === here ? "on" : ""}">${s.icon} ${s.name}</a>`).join("")}</nav>`;
  document.body.prepend(el);
  const s = SITES.find((x) => x.id === here);
  if (s) document.documentElement.style.setProperty("--accent", s.color);
}

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const $ = (s) => document.querySelector(s);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const store = (() => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } })();
export async function getJSON(url, ttlMin = 15, parse = (r) => r.json()) {
  const key = "bb:" + url;
  if (store && ttlMin > 0) { try { const hit = JSON.parse(store.getItem(key) || "null"); if (hit && Date.now() - hit.t < ttlMin * 60000) return hit.v; } catch {} }
  let v;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) { v = await parse(r); break; }
      if (r.status !== 429 && r.status < 500) throw Object.assign(new Error(`${r.status} ${new URL(url).host}`), { fatal: true });
      if (i >= 2) throw new Error(`${r.status} ${new URL(url).host}`);
    } catch (e) { if (e.fatal || i >= 2) throw e; }
    await new Promise((res) => setTimeout(res, 1200 * 2 ** i));
  }
  if (store && ttlMin > 0) { try { store.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {} }
  return v;
}
export const getText = (url, ttl) => getJSON(url, ttl, (r) => r.text());

// Units: US by default for en-US, else metric. Persisted per viewer.
export const units = {
  get us() { try { const u = store?.getItem("bb:units"); if (u) return u === "us"; } catch {} return typeof navigator !== "undefined" && /^en-US/.test(navigator.language); },
  set(us) { try { store?.setItem("bb:units", us ? "us" : "metric"); } catch {} },
};
export const temp = (c) => (c == null ? "–" : units.us ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`);
export const speed = (kmh) => (kmh == null ? "–" : units.us ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);
export const len = (m) => (m == null ? "–" : units.us ? `${(m * 3.281).toFixed(1)} ft` : `${m.toFixed(1)} m`);
export const rain = (mm) => (mm == null ? "–" : units.us ? `${(mm / 25.4).toFixed(2)}″` : `${mm.toFixed(1)} mm`);
export function unitToggle(onChange) {
  const b = document.createElement("button");
  const label = () => (b.textContent = units.us ? "°F · mph" : "°C · km/h");
  label(); b.title = "Switch units";
  b.onclick = () => { units.set(!units.us); label(); onChange(); };
  return b;
}

export const dayLabel = (d) => new Date(d + "T12:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const isoDay = (t = new Date()) => t.toISOString().slice(0, 10);
export const addDays = (iso, n) => isoDay(new Date(Date.parse(iso + "T12:00Z") + n * 864e5));
export const doy = (iso) => Math.round((Date.parse(iso + "T12:00Z") - Date.parse(iso.slice(0, 4) + "-01-01T12:00Z")) / 864e5) + 1;

// 0–100 score → label + color (shared across all sites).
export function grade(s) {
  if (s == null) return { label: "–", color: "#8a96a3" };
  if (s >= 80) return { label: "Bluebird", color: "#1f6feb" };
  if (s >= 65) return { label: "Good", color: "#1f9d63" };
  if (s >= 45) return { label: "Fair", color: "#c99a1c" };
  if (s >= 25) return { label: "Poor", color: "#d9793a" };
  return { label: "Stay home", color: "#c9473a" };
}
export const gradePill = (s) => { const g = grade(s); return `<span class="pill" style="background:${g.color}">${g.label}</span>`; };

// Moon phase (0 = new, 0.5 = full) and illumination, good to ~1 day.
export function moon(date = new Date()) {
  const synodic = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const phase = ((((date.getTime() - ref) / 864e5) % synodic) + synodic) % synodic / synodic;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return { phase, illum, name: names[Math.round(phase * 8) % 8], icon: ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"][Math.round(phase * 8) % 8] };
}

// Leaflet base map (Leaflet loaded globally from cdnjs by each page).
export function baseMap(id, center, zoom) {
  const map = L.map(id).setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
  return map;
}

// Click-anywhere location state kept in the URL hash (#lat,lon).
export function hashPoint(fallback) {
  const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return m ? [+m[1], +m[2]] : fallback;
}
export const setHashPoint = ([lat, lon]) => history.replaceState(null, "", `#${lat.toFixed(4)},${lon.toFixed(4)}`);
