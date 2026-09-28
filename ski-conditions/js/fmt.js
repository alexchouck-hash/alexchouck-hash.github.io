// Unit formatters for the ops dashboard and the embed widget. us: boolean getter.
export function formatters(us) {
  return {
    cm: (v) => (v == null ? "–" : us() ? `${(v / 2.54).toFixed(v < 25 ? 1 : 0)}″` : `${v.toFixed(v < 10 ? 1 : 0)} cm`),
    deg: (v) => (v == null ? "–" : us() ? `${Math.round(v * 9 / 5 + 32)}°F` : `${Math.round(v)}°C`),
    m: (v) => (v == null ? "–" : us() ? `${Math.round(v * 3.281).toLocaleString()} ft` : `${Math.round(v).toLocaleString()} m`),
    kmh: (v) => (v == null ? "–" : us() ? `${Math.round(v / 1.609)} mph` : `${Math.round(v)} km/h`),
  };
}
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const dayLabel = (d) => new Date(d + "T12:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const todayAt = (h) => new Date(Date.now() + h.utcOffset * 1000).toISOString().slice(0, 10);
