// Camping: score each night (evening 18:00 through morning 08:00) for comfort,
// dryness, wind, storms, plus stars, bugs, frost and dew flags.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// h: hourly { time[], temp[], dew[], rh[], precip[], pop[], wind[], gust[], cloud[], cape[] } (local time)
// moonIllum(dateISO) → 0..1
export function nights(h, moonIllum) {
  const out = [];
  const dates = [...new Set(h.time.map((t) => t.slice(0, 10)))];
  for (const d of dates) {
    const idx = h.time.map((t, i) => [t, i]).filter(([t]) => (t.slice(0, 10) === d && +t.slice(11, 13) >= 18) || (t.slice(0, 10) > d && t <= nextMorning(d))).map(([, i]) => i);
    if (idx.length < 12) continue;
    const pick = (k) => idx.map((i) => h[k][i]).filter((v) => v != null);
    const low = Math.min(...pick("temp")), rainMm = pick("precip").reduce((a, v) => a + v, 0), pop = Math.max(0, ...pick("pop"));
    const gust = Math.max(0, ...pick("gust")), cloud = avg(idx.filter((i) => { const hr = +h.time[i].slice(11, 13); return hr >= 21 || hr <= 3; }).map((i) => h.cloud[i]).filter((v) => v != null)) ?? 50;
    const storm = idx.some((i) => (h.cape[i] ?? 0) > 800 && (h.pop[i] ?? 0) >= 40);
    const eve = idx.filter((i) => { const hr = +h.time[i].slice(11, 13); return hr >= 18 && hr <= 22; });
    const eveT = avg(eve.map((i) => h.temp[i])), eveRH = avg(eve.map((i) => h.rh[i])), eveW = avg(eve.map((i) => h.wind[i]));
    const dewSpread = Math.min(...idx.map((i) => (h.temp[i] ?? 99) - (h.dew[i] ?? -99)));
    let s = 100;
    s -= low < 5 ? (5 - low) * 4 : low > 16 ? (low - 16) * 4 : 0;
    s -= clamp(rainMm * 8, 0, 50) + (pop >= 50 ? 8 : 0);
    s -= gust > 35 ? (gust - 35) * 1.2 : 0;
    if (storm) s -= 30;
    const illum = moonIllum(d);
    out.push({
      date: d, score: Math.round(clamp(s, 0, 100)), low, rain: rainMm, pop, gust, storm,
      stars: Math.round(clamp((100 - cloud) * (1 - 0.6 * illum), 0, 100)),
      bugs: eveT != null && eveT > 15 && eveRH > 65 && eveW < 12, frost: low <= 0, dew: dewSpread < 2 && low > 0,
    });
  }
  return out;
}
const nextMorning = (d) => new Date(Date.parse(d + "T12:00Z") + 864e5).toISOString().slice(0, 10) + "T08:00";
