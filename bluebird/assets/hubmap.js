// Hub map: every scored sample spot from the live readings, colored by score.
// Leaflet is fetched only when this runs, so it never competes with first paint.
import { grade, esc } from "./shared.js";

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
let leaflet;
export function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  return (leaflet ||= new Promise((ok, fail) => {
    const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: CDN + "leaflet.min.css" });
    const js = Object.assign(document.createElement("script"), { src: CDN + "leaflet.min.js", async: true });
    js.onload = () => ok(globalThis.L); js.onerror = fail;
    document.head.append(css, js);
  }));
}

// Resolves once the page has finished loading and `el` is within ~300px of the viewport.
export function whenReady(el) {
  const loaded = document.readyState === "complete" ? Promise.resolve() : new Promise((r) => addEventListener("load", r, { once: true }));
  const near = new Promise((r) => {
    if (!("IntersectionObserver" in globalThis)) return r();
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); r(); } }, { rootMargin: "300px" });
    io.observe(el);
  });
  const idle = () => new Promise((r) => (globalThis.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 200)));
  return Promise.all([loaded, near]).then(idle);
}

export const inNorthAmerica = (d) => d.lat >= 7 && d.lat <= 72 && d.lon >= -170 && d.lon <= -50;

// dots: [{ name, lat, lon, score, detail, site: { name, icon, color, href } }]
export function drawMap(el, dots) {
  const L = globalThis.L;
  const map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap contributors" }).addTo(map);
  const layer = L.featureGroup().addTo(map);
  for (const d of dots.slice().sort((a, b) => (a.score ?? -1) - (b.score ?? -1))) {
    const g = grade(d.score);
    L.circleMarker([d.lat, d.lon], { radius: 7, color: d.site.color, weight: 2.5, fillColor: g.color, fillOpacity: 0.95 })
      .bindTooltip(`<b>${d.site.icon} ${esc(d.name)}</b><br>${esc(d.site.name)} · ${d.score ?? "–"} ${g.label}<br><span style="color:#5a6a7c">${esc(d.detail || "")}</span>`)
      .on("click", () => (location.href = d.site.href))
      .addTo(layer);
  }
  // Frame North America (where most spots are); overseas dots stay a zoom-out away.
  const na = dots.filter(inNorthAmerica);
  map.fitBounds(na.length >= dots.length / 2 ? L.latLngBounds(na.map((d) => [d.lat, d.lon])).pad(0.08) : layer.getBounds().pad(0.15), { maxZoom: 5 });
  return map;
}
