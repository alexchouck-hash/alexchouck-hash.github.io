// Event calendar model: resolves rule-based events to dates, travel-demand
// holidays, and a daily demand score for short-term rental pricing. Pure functions.
const DAY = 864e5;
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
const utc = (y, m, d) => Date.UTC(y, m, d, 12);
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month - 1, day);
}
// n-th weekday (0 = Sunday) of a month (0-based); n = -1 for the last.
export function nthWeekday(y, m, wd, n) {
  if (n > 0) { const first = new Date(utc(y, m, 1)).getUTCDay(); return utc(y, m, 1 + ((wd - first + 7) % 7) + 7 * (n - 1)); }
  const lastDay = new Date(Date.UTC(y, m + 1, 0, 12)), last = lastDay.getUTCDay();
  return lastDay.getTime() - ((last - wd + 7) % 7) * DAY;
}
export function resolve(rule, y) {
  let start, days = rule.days ?? 1;
  if (rule.fixed) { const [md, n] = rule.fixed; start = utc(y, +md.slice(0, 2) - 1, +md.slice(3)); days = n; }
  else if (rule.nth) { const [m, wd, n] = rule.nth; start = nthWeekday(y, m - 1, wd, n); }
  else if (rule.easter != null) start = easter(y) + rule.easter * DAY;
  else return null;
  start += (rule.offset || 0) * DAY;
  return { start: iso(start), end: iso(start + (days - 1) * DAY) };
}
export function distKm(a, b) {
  const R = Math.PI / 180, x = Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
// Curated events (plus optional live ones: { name, start, end, lat, lon, ... }) within radius and date range.
export function eventsNear(catalog, live, [lat, lon], from, to, radiusKm = 80) {
  const out = [];
  const y0 = +from.slice(0, 4), y1 = +to.slice(0, 4);
  for (const e of catalog) for (let y = y0 - 1; y <= y1; y++) {
    const r = resolve(e.rule, y);
    if (!r || r.end < from || r.start > to) continue;
    const km = distKm([lat, lon], [e.lat, e.lon]);
    if (km <= radiusKm) out.push({ ...e, ...r, km: Math.round(km), source: "curated", approximate: true });
  }
  for (const e of live || []) {
    if (!e.start || e.start > to || (e.end || e.start) < from || e.lat == null) continue;
    const km = distKm([lat, lon], [e.lat, e.lon]);
    if (km <= radiusKm) out.push({ impact: 1, category: "live", ...e, end: e.end || e.start, km: Math.round(km), source: "live" });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : b.impact - a.impact));
}

// US leisure-travel peaks (origin-market demand), weight 0..1.
export function usTravelPeaks(y) {
  const e = easter(y), thanks = nthWeekday(y, 10, 4, 4), P = (s, eDay, name, w) => ({ start: iso(s), end: iso(eDay), name, weight: w });
  return [
    P(utc(y, 0, 1), utc(y, 0, 3), "New Year holiday", 0.8),
    P(nthWeekday(y, 0, 1, 3) - 2 * DAY, nthWeekday(y, 0, 1, 3), "MLK weekend", 0.6),
    P(nthWeekday(y, 1, 1, 3) - 9 * DAY, nthWeekday(y, 1, 1, 3), "Presidents' Day week", 0.8),
    P(utc(y, 2, 7), utc(y, 2, 29), "Spring break season", 0.6),
    P(e - 9 * DAY, e + DAY, "Easter / Holy Week", 0.6),
    P(nthWeekday(y, 4, 1, -1) - 3 * DAY, nthWeekday(y, 4, 1, -1), "Memorial Day weekend", 0.7),
    P(utc(y, 5, 15), utc(y, 7, 10), "Summer school break", 0.35),
    P(utc(y, 6, 2), utc(y, 6, 6), "Independence Day", 0.7),
    P(nthWeekday(y, 8, 1, 1) - 3 * DAY, nthWeekday(y, 8, 1, 1), "Labor Day weekend", 0.6),
    P(thanks - DAY, thanks + 3 * DAY, "Thanksgiving", 0.7),
    P(utc(y, 11, 20), utc(y, 11, 31), "Christmas & holiday break", 1.0),
  ];
}

// Daily demand 0..100 for pricing: weekends, travel peaks, local public holidays, events.
export const DEMAND = [[80, "Peak", "#c9473a"], [60, "High", "#d9793a"], [40, "Normal", "#c99a1c"], [0, "Low", "#1f9d63"]];
export const demandLabel = (s) => { const [, label, color] = DEMAND.find(([t]) => s >= t); return { label, color }; };
export function demandFor(dateIso, { peaks = [], holidays = [], events = [] }) {
  const wd = new Date(dateIso + "T12:00Z").getUTCDay();
  let s = 25 + (wd === 5 || wd === 6 ? 20 : wd === 0 ? 5 : 0);
  const reasons = [];
  const peak = peaks.filter((p) => dateIso >= p.start && dateIso <= p.end).sort((a, b) => b.weight - a.weight)[0];
  if (peak) { s += 40 * peak.weight; reasons.push(peak.name); }
  const hol = holidays.find((h) => h.date === dateIso);
  if (hol) { s += 12; reasons.push(hol.localName || hol.name); }
  const ev = events.filter((e) => dateIso >= e.start && dateIso <= e.end);
  if (ev.length) { s += Math.min(40, ev.reduce((a, e) => a + 13 * e.impact, 0)); reasons.push(...ev.map((e) => e.name)); }
  return { score: Math.round(Math.min(100, s)), reasons };
}

// iCalendar export (all-day events).
export function toICS(events, calName = "Bluebird events") {
  const esc = (t) => String(t).replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const d = (x) => x.replace(/-/g, "");
  const next = (x) => iso(Date.parse(x + "T12:00Z") + DAY).replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bluebird//Events//EN", `X-WR-CALNAME:${esc(calName)}`];
  for (const e of events) lines.push("BEGIN:VEVENT", `UID:${e.id || e.name}-${e.start}@bluebird`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${next(e.end)}`, `SUMMARY:${esc(e.name)}`, `LOCATION:${esc(e.town || e.venue || "")}`, `DESCRIPTION:${esc((e.approximate ? "Dates approximate; confirm with the organizer. " : "") + (e.note || "") + (e.url ? " " + e.url : ""))}`, "END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
