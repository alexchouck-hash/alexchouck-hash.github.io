// Offshore fishing: go/no-go by boat size, from waves, wave period, wind and storms.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const BOATS = {
  small: { label: "Under 25 ft", waveOk: 0.6, waveMax: 1.5, windOk: 18, windMax: 37 },  // m, km/h (≈10 / 20 kt)
  mid:   { label: "25–35 ft",    waveOk: 1.0, waveMax: 2.4, windOk: 28, windMax: 46 },
  large: { label: "Over 35 ft",  waveOk: 1.5, waveMax: 3.2, windOk: 37, windMax: 55 },
};
// Short-period seas are steeper and rougher than their height suggests.
export const effectiveWave = (h, period) => (h == null ? null : h * (1 + Math.max(0, 8 - (period ?? 8)) / 8));

export function hourScore(boat, { wave, period, wind, gust, cape, pop }) {
  const b = BOATS[boat];
  const hw = effectiveWave(wave, period) ?? 0;
  let s = 100;
  s -= hw <= b.waveOk ? (hw / b.waveOk) * 15 : 15 + ((hw - b.waveOk) / (b.waveMax - b.waveOk)) * 70;
  s -= wind <= b.windOk ? (wind / b.windOk) * 10 : 10 + ((wind - b.windOk) / (b.windMax - b.windOk)) * 60;
  if (gust > b.windMax) s -= 10;
  if ((cape ?? 0) > 1000 && (pop ?? 0) >= 40) s -= 25; else if ((pop ?? 0) >= 60) s -= 8;
  return Math.round(clamp(s, 0, 100));
}

// Best 6-hour morning window (05–13 local) per day, plus the day's worst hazards.
export function days(boat, h) {
  const byDay = {};
  h.time.forEach((t, i) => {
    const d = t.slice(0, 10), hr = +t.slice(11, 13);
    const x = { wave: h.wave[i], period: h.period[i], wind: h.wind[i], gust: h.gust[i], cape: h.cape[i], pop: h.pop[i] };
    const r = (byDay[d] ||= { date: d, hours: [], maxWave: 0, maxWind: 0, storm: false, sst: [] });
    if (hr >= 5 && hr <= 13) r.hours.push(hourScore(boat, x));
    r.maxWave = Math.max(r.maxWave, x.wave ?? 0); r.maxWind = Math.max(r.maxWind, x.wind ?? 0);
    if ((x.cape ?? 0) > 1000 && (x.pop ?? 0) >= 40) r.storm = true;
    if (h.sst[i] != null) r.sst.push(h.sst[i]);
  });
  return Object.values(byDay).filter((r) => r.hours.length >= 6).map((r) => {
    let best = 0;
    for (let k = 0; k + 6 <= r.hours.length; k++) best = Math.max(best, Math.min(...r.hours.slice(k, k + 6)));
    return { date: r.date, score: best, maxWave: r.maxWave, maxWind: r.maxWind, storm: r.storm, sst: r.sst.length ? r.sst.reduce((a, v) => a + v, 0) / r.sst.length : null };
  });
}

// Temperature break: biggest SST difference between the point and its neighbours (°C).
export function tempBreak(center, neighbours) {
  const v = neighbours.filter((x) => x != null);
  if (center == null || !v.length) return null;
  return +Math.max(...v.map((x) => Math.abs(x - center))).toFixed(1);
}
