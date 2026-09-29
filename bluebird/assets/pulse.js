// Hub "pulse": one live reading per partner site, season-aware card order and
// time-of-day sky. Readings reuse each site's own model on a few sample spots.
import { getJSON, getText, temp, units, len, isoDay, addDays, doy, moon, clamp } from "./shared.js";
import { SPOTS } from "../foliage/spots.js";
import * as F from "../foliage/model.js";
import { FALLS } from "../waterfalls/spots.js";
import { seasonal, flowClass } from "../waterfalls/model.js";
import { parseIV, parseStats, percentile, rate, RATINGS } from "../rivers/model.js";
import { days as seaDays } from "../offshore/model.js";
import { nights } from "../camp/model.js";
import { EVENTS } from "../events/catalog.js";
import { resolve as eventDates } from "../events/model.js";

// How much each site matters this month (Jan..Dec, 0–3). Northern-hemisphere seasons.
const SEASON = {
  snow:       [3, 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3],
  beach:      [3, 3, 3, 3, 2, 1, 1, 1, 0, 1, 2, 3],
  foliage:    [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 1, 0],
  rivers:     [1, 1, 2, 3, 3, 3, 2, 1, 1, 1, 1, 1],
  waterfalls: [1, 1, 2, 3, 3, 2, 1, 1, 1, 1, 1, 1],
  events:     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  offshore:   [0, 0, 1, 1, 2, 3, 3, 3, 2, 2, 1, 0],
  camp:       [0, 0, 1, 1, 2, 3, 3, 3, 2, 2, 1, 0],
};
export const inSeason = (id, date = new Date()) => SEASON[id]?.[date.getMonth()] ?? 1;
// Stable sort: in-season sites first, original order otherwise.
export const seasonOrder = (sites, date = new Date()) =>
  sites.map((s, i) => [s, i]).sort((a, b) => inSeason(b[0].id, date) - inSeason(a[0].id, date) || a[1] - b[1]).map(([s]) => s);

// Local hour → sky phase for the hero.
export function sky(hour) {
  if (hour < 5 || hour >= 21) return "night";
  if (hour < 8) return "dawn";
  if (hour < 18) return "day";
  return "dusk";
}

// Sample spots per site: [name, lat, lon].
const SNOW = [["Alta", 40.59, -111.64], ["Whistler", 50.06, -122.95], ["Jackson Hole", 43.59, -110.83], ["Stowe", 44.53, -72.78], ["Zermatt", 45.98, 7.73], ["Niseko", 42.86, 140.69], ["Portillo", -32.84, -70.13], ["Thredbo", -36.5, 148.3]];
const BEACH = [["Cancún", 21.13, -86.75], ["Punta Cana", 18.58, -68.37], ["Aruba", 12.55, -70.05], ["Key West", 24.55, -81.8], ["Grand Cayman", 19.33, -81.38], ["Barbados", 13.1, -59.63]];
const SEA = [["Montauk", 40.95, -71.8], ["Outer Banks", 35.2, -75.3], ["Islamorada", 24.8, -80.5], ["Destin", 30.2, -86.5], ["Cabo San Lucas", 22.75, -109.8]];
const CAMP = [["Yosemite Valley", 37.74, -119.58], ["Acadia", 44.34, -68.27], ["Zion", 37.2, -112.99], ["Great Smokies", 35.61, -83.43], ["Boundary Waters", 47.95, -91.5]];
const GAUGES = ["03504000", "01646500", "03185400"]; // Nantahala, Potomac, New River Gorge

const pts = (list) => `latitude=${list.map((p) => p[1]).join(",")}&longitude=${list.map((p) => p[2]).join(",")}`;
const many = (j) => (Array.isArray(j) ? j : [j]);
const best = (arr, k = "score") => arr.filter((x) => x && x[k] != null).sort((a, b) => b[k] - a[k])[0];

// Each reading resolves to { score?, text, sub? }. `score` uses the shared 0–100 scale.
export const READINGS = {
  async snow() {
    const j = many(await getJSON(`https://api.open-meteo.com/v1/forecast?${pts(SNOW)}&daily=snowfall_sum&forecast_days=7&timezone=auto`, 60));
    return snowReading(j.map((r, i) => ({ name: SNOW[i][0], cm: (r.daily?.snowfall_sum || []).reduce((a, v) => a + (v || 0), 0) })));
  },
  async beach() {
    const j = many(await getJSON(`https://api.open-meteo.com/v1/forecast?${pts(BEACH)}&daily=temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,uv_index_max&forecast_days=2&timezone=auto`, 60));
    const r = best(j.map((x, i) => beachDay(BEACH[i][0], x.daily, 1)));
    return r && { score: r.score, place: r.name, when: "Tomorrow", text: `Best tomorrow: ${r.name}`, sub: `${temp(r.tmax)}, ${r.pop}% chance of rain` };
  },
  async foliage() { return foliageReading(isoDay()); },
  async events() { return eventsReading(isoDay()); },
  async waterfalls() {
    const d = isoDay(), f = best(FALLS.map((x) => ({ name: x.name, score: Math.round(seasonal(x, d)) })));
    return { text: `Flowing hardest this time of year: ${f.name}`, sub: `${flowClass(f.score).label} in a typical year; the site adds recent rain.` };
  },
  async rivers() {
    const iv = parseIV(await getJSON(`https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${GAUGES.join(",")}&parameterCd=00060&period=P1D`, 15));
    const now = new Date();
    const st = parseStats(await getText(`https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=${GAUGES.join(",")}&statReportType=daily&statTypeCd=p10,p25,p50,p75,p90&parameterCd=00060`, 60 * 24), now.getMonth() + 1, now.getDate());
    const g = best(Object.values(iv).map((x) => ({ ...x, rating: rate(percentile(x.flow, st[x.site]), x.flow, x.flowPrev) })).map((x) => ({ ...x, score: RATINGS[x.rating].score })));
    return g && { score: g.score, place: g.name, when: "Today", text: g.name, sub: `${Math.round(g.flow).toLocaleString()} cfs · ${RATINGS[g.rating].label}` };
  },
  async offshore() {
    const [m, w] = await Promise.all([
      getJSON(`https://marine-api.open-meteo.com/v1/marine?${pts(SEA)}&hourly=wave_height,wave_period,sea_surface_temperature&forecast_days=4&timezone=auto`, 60),
      getJSON(`https://api.open-meteo.com/v1/forecast?${pts(SEA)}&hourly=wind_speed_10m,wind_gusts_10m,precipitation_probability,cape&forecast_days=4&timezone=auto`, 60),
    ]);
    const W = many(w);
    const r = best(many(m).flatMap((x, i) => {
      const h = x.hourly, v = W[i]?.hourly; if (!h || !v) return [];
      return seaDays("mid", { time: h.time, wave: h.wave_height, period: h.wave_period, sst: h.sea_surface_temperature, wind: v.wind_speed_10m, gust: v.wind_gusts_10m, pop: v.precipitation_probability, cape: v.cape }).map((d) => ({ ...d, name: SEA[i][0] }));
    }));
    return r && { score: r.score, place: r.name, when: dayName(r.date), text: `Calmest run: ${r.name}, ${dayName(r.date)}`, sub: `Seas to ${len(r.maxWave)} · 25–35 ft boat` };
  },
  async camp() {
    const j = many(await getJSON(`https://api.open-meteo.com/v1/forecast?${pts(CAMP)}&hourly=temperature_2m,dew_point_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover,cape&forecast_days=5&timezone=auto`, 60));
    const illum = (d) => moon(new Date(d + "T04:00Z")).illum;
    const r = best(j.flatMap((x, i) => { const h = x.hourly; if (!h) return [];
      return nights({ time: h.time, temp: h.temperature_2m, dew: h.dew_point_2m, rh: h.relative_humidity_2m, precip: h.precipitation, pop: h.precipitation_probability, wind: h.wind_speed_10m, gust: h.wind_gusts_10m, cloud: h.cloud_cover, cape: h.cape }, illum).map((n) => ({ ...n, name: CAMP[i][0] })); }));
    return r && { score: r.score, place: r.name, when: `${dayName(r.date)} night`, text: `Best night: ${r.name}, ${dayName(r.date)}`, sub: `Low ${temp(r.low)} · stars ${r.stars}/100` };
  },
};

const dayName = (d) => new Date(d + "T12:00Z").toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });

// Cross-site "where's it bluebird" picks: one per site, Good or better, best first.
export const topPicks = (readings, n = 4) =>
  readings.filter((r) => r?.score != null && r.score >= 65 && r.place).sort((a, b) => b.score - a.score).slice(0, n);

// Pure helpers (tested).
// Next big event (biggest draw first, then soonest) starting or running within 30 days. Catalog dates are rule-based and approximate.
export function eventsReading(today, catalog = EVENTS) {
  const to = addDays(today, 30), y = +today.slice(0, 4);
  const up = catalog.flatMap((e) => [y - 1, y, y + 1].map((yr) => ({ e, r: eventDates(e.rule, yr) })))
    .filter(({ r }) => r && r.end >= today && r.start <= to)
    .sort((a, b) => b.e.impact - a.e.impact || a.r.start.localeCompare(b.r.start));
  if (!up.length) return { text: "A quiet month for big events", sub: "Check any town for holidays and local demand" };
  const { e, r } = up[0], d = (x) => new Date(x + "T12:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return { text: `${r.start <= today ? "On now" : "Coming up"}: ${e.name}`, sub: `${e.town} · ${d(r.start)}${r.end !== r.start ? `–${r.end.slice(0, 7) === r.start.slice(0, 7) ? +r.end.slice(8) : d(r.end)}` : ""} (approx.)${up.length > 1 ? ` · +${up.length - 1} more this month` : ""}` };
}
export function snowReading(rows) {
  const r = rows.slice().sort((a, b) => b.cm - a.cm)[0];
  if (!r || r.cm < 1) return { text: "Quiet week: no real snow in the forecast", sub: "Across 8 sample resorts worldwide" };
  return { score: Math.round(clamp(r.cm * 2.5, 0, 100)), place: r.name, when: "Next 7 days", text: `Most new snow: ${r.name}`, sub: `${units.us ? `${Math.round(r.cm / 2.54)}″` : `${Math.round(r.cm)} cm`} in the next 7 days` };
}
export function beachDay(name, d, i) {
  if (!d?.temperature_2m_max) return null;
  const tmax = d.temperature_2m_max[i], pop = d.precipitation_probability_max?.[i] ?? 0, wind = d.wind_speed_10m_max?.[i] ?? 0;
  const s = 100 - Math.abs(tmax - 29) * 4 - pop * 0.5 - Math.max(0, wind - 25) * 1.5;
  return { name, tmax, pop, score: Math.round(clamp(s, 0, 100)) };
}
export function foliageReading(today) {
  const n = doy(today);
  const near = SPOTS.map((s) => ({ s, d: n - F.doyOf(`${today.slice(0, 4)}-${s.peak}`) })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
  if (Math.abs(near.d) > 21) return { text: "Off season", sub: "Color starts in the far north in mid September" };
  const st = F.stage(near.d);
  return { score: F.colorPct(near.d), place: near.s.name, when: "This week", text: `${st.label} around now: ${near.s.name}`, sub: `${near.s.region} · typical peak ${new Date(`2000-${near.s.peak}T12:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}` };
}
