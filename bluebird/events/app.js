import { header, $, esc, getJSON, dayLabel, isoDay, addDays, baseMap, hashPoint, setHashPoint } from "../assets/shared.js";
import { RESORTS as SKI } from "../../ski-conditions/js/resorts.js";
import { EVENTS } from "./catalog.js";
import { eventsNear, usTravelPeaks, demandFor, demandLabel, DEMAND, toICS, distKm } from "./model.js";

header("events");
const FEED = "https://raw.githubusercontent.com/alexchouck-hash/alexchouck-hash.github.io/data-feed/events/live.json";
const TODAY = isoDay(), END = addDays(TODAY, 89);
// Places: ski resorts plus curated event towns.
const PLACES = [...SKI.map((r) => ({ id: "ski:" + r.id, name: r.name, lat: r.lat, lon: r.lon, country: r.country })),
  ...[...new Map(EVENTS.map((e) => [e.town, e])).values()].map((e) => ({ id: "town:" + e.town, name: e.town, lat: e.lat, lon: e.lon, country: e.country }))].sort((a, b) => a.name.localeCompare(b.name));
let pt = hashPoint([39.19, -106.82]), live = [], holidays = [], marker, current = [];
const map = baseMap("map", pt, 8);
$("#place").innerHTML = `<option value="">(map point)</option>` + PLACES.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
$("#legend").innerHTML = DEMAND.slice().reverse().map(([, l, c]) => `<span><span class="pill" style="background:${c}">&nbsp;</span> ${l}</span>`).join("");
const nearestPlace = (p) => PLACES.map((x) => ({ x, km: distKm(p, [x.lat, x.lon]) })).sort((a, b) => a.km - b.km)[0];

async function loadHolidays(cc) {
  if (!/^[A-Z]{2}$/.test(cc)) return [];
  const ys = [...new Set([TODAY.slice(0, 4), END.slice(0, 4)])];
  const all = await Promise.all(ys.map((y) => getJSON(`https://date.nager.at/api/v3/PublicHolidays/${y}/${cc}`, 60 * 24 * 7).catch(() => [])));
  return all.flat().filter((h) => h.global !== false);
}

async function go(p, fromSelect) {
  pt = p; setHashPoint(p);
  (marker ||= L.marker(p).addTo(map)).setLatLng(p);
  const near = nearestPlace(p);
  if (!fromSelect) $("#place").value = near.km < 15 ? near.x.id : "";
  if (!$("#country").dataset.manual) $("#country").value = near.x.country;
  $("#where").textContent = near.km < 15 ? near.x.name : `${p[0].toFixed(3)}, ${p[1].toFixed(3)} (near ${near.x.name})`;
  $("#status").textContent = "Loading holidays…";
  holidays = await loadHolidays($("#country").value.toUpperCase());
  $("#status").textContent = "";
  render();
}

function render() {
  const radius = +$("#radius").value, placeName = $("#place").selectedOptions[0]?.value ? $("#place").selectedOptions[0].text : $("#where").textContent;
  current = eventsNear(EVENTS, live, pt, TODAY, END, radius);
  const peaks = [...usTravelPeaks(+TODAY.slice(0, 4)), ...usTravelPeaks(+TODAY.slice(0, 4) + 1)];
  const inRange = holidays.filter((h) => h.date >= TODAY && h.date <= END);
  $("#title").textContent = `Events & demand: ${placeName}`;
  // Three months of calendar grid.
  let html = "";
  for (let k = 0; k < 3; k++) {
    const first = new Date(Date.UTC(+TODAY.slice(0, 4), +TODAY.slice(5, 7) - 1 + k, 1, 12));
    const y = first.getUTCFullYear(), m = first.getUTCMonth(), n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    html += `<div class="month"><h3>${first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</h3><div class="cal">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="h">${d}</div>`).join("")}`;
    html += `<div class="d blank"></div>`.repeat(first.getUTCDay());
    for (let d = 1; d <= n; d++) {
      const iso = new Date(Date.UTC(y, m, d, 12)).toISOString().slice(0, 10);
      const dm = demandFor(iso, { peaks, holidays: inRange, events: current }), c = demandLabel(dm.score);
      const hasEv = current.some((e) => iso >= e.start && iso <= e.end) || inRange.some((h) => h.date === iso);
      html += `<div class="d" style="background:${iso < TODAY ? "#b8c2cc" : c.color}" title="${esc(`${dayLabel(iso)}: ${c.label} demand (${dm.score})${dm.reasons.length ? " · " + dm.reasons.join(", ") : ""}`)}"><b>${d}</b>${hasEv ? '<span class="dot"></span>' : ""}</div>`;
    }
    html += `</div></div>`;
  }
  $("#cal").innerHTML = html;
  const items = [...current.map((e) => ({ ...e, kind: "event" })), ...inRange.map((h) => ({ name: h.localName && h.localName !== h.name ? `${h.name} (${h.localName})` : h.name, start: h.date, end: h.date, kind: "holiday" }))].sort((a, b) => (a.start < b.start ? -1 : 1));
  $("#list").innerHTML = items.length ? items.map((e) => `<div class="ev" style="${e.kind === "holiday" ? "border-color:#8a96a3" : ""}"><b>${esc(e.name)}</b> <span class="muted small">${e.start === e.end ? dayLabel(e.start) : `${dayLabel(e.start)} – ${dayLabel(e.end)}`}</span><br>
    <span class="small">${e.kind === "holiday" ? "Public holiday" : `${esc(e.town || e.venue || "")}${e.km != null ? ` · ${e.km} km` : ""} · ${"●".repeat(e.impact)}${"○".repeat(3 - e.impact)} impact${e.approximate ? " · dates approximate" : ""}${e.url ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener">details</a>` : ""}`}</span>${e.note ? `<br><span class="small muted">${esc(e.note)}</span>` : ""}</div>`).join("") : `<p class="small muted">No curated events or public holidays in the next 90 days within ${radius} km.</p>`;
}

$("#place").onchange = (e) => { const p = PLACES.find((x) => x.id === e.target.value); if (p) { map.setView([p.lat, p.lon], 9); go([p.lat, p.lon], true); } };
$("#radius").onchange = render;
$("#country").onchange = (e) => { e.target.dataset.manual = "1"; e.target.value = e.target.value.toUpperCase(); go(pt, true); };
$("#ics").onclick = () => {
  const blob = new Blob([toICS(current, `Events near ${$("#where").textContent}`)], { type: "text/calendar" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "bluebird-events.ics" });
  a.click(); URL.revokeObjectURL(a.href);
};
map.on("click", (e) => go([e.latlng.lat, e.latlng.lng]));
getJSON(FEED, 60).then((j) => { live = j.events || []; render(); }).catch(() => {});
go(pt);
