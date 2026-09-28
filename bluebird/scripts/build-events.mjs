// Optional live events from the Ticketmaster Discovery API (free key).
// Set the repository secret TICKETMASTER_API_KEY to enable; without it this
// script exits quietly and the site uses only curated events and holidays.
// Writes events/live.json on the data-feed branch: events within 60 km of every
// ski resort and curated event town, for the next 120 days.
import { mkdir, writeFile } from "node:fs/promises";
import { RESORTS } from "../../ski-conditions/js/resorts.js";
import { EVENTS } from "../events/catalog.js";

const KEY = process.env.TICKETMASTER_API_KEY;
const root = new URL((process.env.FEED_DIR || "feed").replace(/\/?$/, "/") + "events/", new URL("../../", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseTicketmaster(j) {
  return (j?._embedded?.events || []).map((e) => {
    const v = e._embedded?.venues?.[0], seg = e.classifications?.[0]?.segment?.name;
    const lat = parseFloat(v?.location?.latitude), lon = parseFloat(v?.location?.longitude);
    const start = e.dates?.start?.localDate;
    if (!start || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { id: "tm:" + e.id, name: e.name, start, end: e.dates?.end?.localDate || start, venue: v?.name, town: [v?.city?.name, v?.state?.stateCode || v?.country?.countryCode].filter(Boolean).join(", "), lat, lon, url: e.url, category: (seg || "event").toLowerCase(), impact: 1 };
  }).filter(Boolean);
}

if (process.env.EVENTS_NO_MAIN !== "1") {
  if (!KEY) { console.log("events: TICKETMASTER_API_KEY not set, skipping live events"); process.exit(0); }
  const points = [...RESORTS.map((r) => [r.lat, r.lon]), ...EVENTS.map((e) => [e.lat, e.lon])];
  const uniq = [...new Map(points.map((p) => [p.map((x) => x.toFixed(1)).join(","), p])).values()];
  const from = new Date().toISOString().slice(0, 19) + "Z", to = new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 19) + "Z";
  const all = new Map();
  let ok = 0;
  for (const [lat, lon] of uniq) {
    try {
      const r = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${KEY}&latlong=${lat},${lon}&radius=60&unit=km&startDateTime=${from}&endDateTime=${to}&size=100&sort=date,asc`);
      if (r.status === 429) { await sleep(5000); continue; }
      if (!r.ok) throw new Error(r.status);
      for (const e of parseTicketmaster(await r.json())) all.set(e.id, e);
      ok++;
    } catch (e) { console.warn(`events ${lat},${lon}: ${e.message}`); }
    await sleep(250); // stay under 5 requests/second
  }
  await mkdir(root, { recursive: true });
  const events = [...all.values()].sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 5000);
  await writeFile(new URL("live.json", root), JSON.stringify({ updated: new Date().toISOString(), source: "Ticketmaster Discovery API", events }));
  console.log(`events: ${events.length} live events from ${ok}/${uniq.length} locations`);
}
