// Top-run picks: crowd model, terrain categories and ranking (pure functions).
// Crowds are modeled from the calendar (weekends, school and public holidays by
// hemisphere and country) plus powder days; they are not live lift counts.

// ---------- crowd ----------
const nthMonday = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)); const off = (8 - d.getUTCDay()) % 7; return new Date(Date.UTC(y, m, 1 + off + 7 * (n - 1))); };
const within = (date, a, b) => date >= a && date <= b;
const md = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

// Lunar New Year (approx) for East Asian resorts, 2025-2030.
const LNY = { 2025: "01-29", 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03" };

// Holiday periods that apply to a resort on a date: [{ name, lift }] (lift 0..1).
export function holidays(resort, iso) {
  const d = new Date(iso + "T00:00Z"), y = d.getUTCFullYear(), out = [];
  const add = (name, lift) => out.push({ name, lift });
  const south = resort.lat < 0, c = resort.country;
  if (south) {
    if (within(d, md(y, 6, 28), md(y, 7, 27))) add("Winter school holidays", 0.35);
    if (within(d, md(y, 9, 20), md(y, 10, 5))) add("Spring school holidays", 0.2);
    return out;
  }
  if (within(d, md(y, 12, 20), md(y, 12, 31)) || within(d, md(y, 1, 1), md(y, 1, 4))) add("Christmas–New Year", 0.45);
  if (["US", "CA"].includes(c)) {
    const mlk = nthMonday(y, 0, 3), pres = nthMonday(y, 1, 3);
    if (within(d, addDays(mlk, -2), mlk)) add("MLK weekend", 0.3);
    if (within(d, addDays(pres, -9), addDays(pres, 5))) add("Presidents' Day week", 0.35);
    if (within(d, md(y, 3, 7), md(y, 3, 29))) add("Spring break", 0.2);
    const thx = new Date(Date.UTC(y, 10, 1 + ((4 - new Date(Date.UTC(y, 10, 1)).getUTCDay() + 7) % 7) + 21));
    if (within(d, addDays(thx, -1), addDays(thx, 3))) add("Thanksgiving", 0.3);
  } else if (["JP", "KR"].includes(c) || c === "IN") {
    const l = LNY[y] && new Date(`${y}-${LNY[y]}T00:00Z`);
    if (l && within(d, addDays(l, -3), addDays(l, 6))) add("Lunar New Year", 0.35);
    if (c === "JP" && within(d, md(y, 1, 8), md(y, 1, 14))) add("Coming of Age long weekend", 0.1);
  } else {
    // European school ski weeks are staggered across February and early March.
    if (within(d, md(y, 2, 7), md(y, 3, 8))) add("School ski holidays", 0.35);
    if (within(d, md(y, 3, 28), md(y, 4, 20))) add("Easter holidays", 0.2);
  }
  return out;
}

const DOW = [0.75, 0.2, 0.15, 0.15, 0.2, 0.4, 1]; // Sun..Sat

// Crowd level 0..1 for a resort on a date. freshCm = new snow that morning.
export function crowd(resort, iso, freshCm = 0) {
  const dow = new Date(iso + "T00:00Z").getUTCDay(), hol = holidays(resort, iso);
  const reasons = [];
  let v = 0.15 + 0.45 * DOW[dow];
  if (dow === 0 || dow === 6) reasons.push("weekend");
  for (const h of hol) { v += h.lift; reasons.push(h.name); }
  if (freshCm >= 15) { v += 0.15; reasons.push("powder day"); }
  v = Math.max(0, Math.min(1, v));
  const level = v >= 0.75 ? "Packed" : v >= 0.5 ? "Busy" : v >= 0.3 ? "Moderate" : "Quiet";
  return { value: +v.toFixed(2), level, reasons };
}

// ---------- terrain categories ----------
const EASY = ["novice", "easy"], STEEP = ["expert", "freeride", "extreme"];
export const CATEGORIES = {
  all: { label: "All terrain", test: () => true },
  groomers: { label: "Groomers", test: (r) => r.groomed && !STEEP.includes(r.difficulty) },
  offpiste: { label: "Off-piste", test: (r) => !r.groomed && (["freeride", "extreme"].includes(r.difficulty) || r.difficulty === "expert" || r.slope >= 30) },
  family: { label: "Family", test: (r) => EASY.includes(r.difficulty) || (r.difficulty === "intermediate" && r.groomed && r.slope < 22) },
  fun: { label: "Fun", test: (r) => ["intermediate", "advanced"].includes(r.difficulty) },
  expert: { label: "Expert", test: (r) => ["advanced", ...STEEP].includes(r.difficulty) },
};

// How much a run feels the crowd: busy beginner and groomed runs fill up,
// steep off-piste terrain stays quieter but its powder is tracked faster.
const exposure = (r) => (EASY.includes(r.difficulty) ? 1 : r.groomed ? 0.9 : STEEP.includes(r.difficulty) ? 0.5 : 0.7);

// Rank score 0..100 for a run in a category, given its surface state and crowd.
export function pickScore(run, st, rd, cat, cr) {
  let s = st.score;
  const fresh = rd?.snow24 || 0;
  if (cat === "groomers" && ["cord", "groomedpp"].includes(st.surface)) s += 6;
  if (cat === "offpiste" || cat === "expert") s += Math.min(10, fresh * 0.4);
  if (cat === "fun") s += Math.min(8, fresh * 0.3) + (st.surface === "moguls" ? 4 : 0);
  if (cat === "family") { if (st.T != null && st.T < -12) s -= 8; if (["ice", "crust", "hardpack"].includes(st.surface)) s -= 6; }
  s -= 25 * cr.value * exposure(run) * (st.surface === "deep" || st.surface === "powder" ? 1.2 : 1);
  return Math.max(0, Math.min(100, Math.round(s)));
}

// Best runs at one loaded resort: sim = [{ run, byDay }].
export function topRuns(sim, day, tod, cat, cr, n = 5) {
  const test = CATEGORIES[cat]?.test || CATEGORIES.all.test;
  return sim
    .map((s) => ({ run: s.run, st: s.byDay[day]?.[tod], rd: s.byDay[day] }))
    .filter((x) => x.st && x.st.surface !== "closed" && test(x.run))
    .map((x) => ({ ...x, pick: pickScore(x.run, x.st, x.rd, cat, cr) }))
    .sort((a, b) => b.pick - a.pick || b.st.score - a.st.score)
    .slice(0, n);
}

// ---------- webcams ----------
// Link-outs only: the resort's official page when known (else a third-party page for it), a map of public webcams around the point and a web search.
export function webcamLinks(name, lat, lon, kind = "ski resort", official, other) {
  const q = encodeURIComponent(`${name} ${kind} webcam live`);
  return [
    ...(official ? [{ label: "Official webcams", url: official }] : other ? [{ label: "Resort webcams (third-party)", url: other }] : []),
    { label: "Webcam map", url: `https://www.windy.com/-Webcams/webcams?${lat.toFixed(3)},${lon.toFixed(3)},12` },
    { label: "Live streams", url: `https://www.youtube.com/results?search_query=${q}&sp=EgJAAQ%253D%253D` },
    { label: "Search webcams", url: `https://www.google.com/search?q=${q}` },
  ];
}
