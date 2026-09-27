// River-level logic: parse USGS responses and rate flows for paddling.
// A gauge's flow is compared with its own daily history (percentiles for this
// calendar day), so ratings work on any river without hand-entered ranges.

// USGS Instantaneous Values JSON → { site: { name, lat, lon, flow, stage, flowPrev, time } }
export function parseIV(j) {
  const out = {};
  for (const ts of j?.value?.timeSeries || []) {
    const si = ts.sourceInfo, site = si.siteCode?.[0]?.value, code = ts.variable?.variableCode?.[0]?.value;
    const nodata = ts.variable?.noDataValue;
    const vals = (ts.values?.[0]?.value || []).map((v) => ({ t: v.dateTime, v: +v.value })).filter((v) => Number.isFinite(v.v) && v.v !== nodata && v.v > -999);
    if (!site || !vals.length) continue;
    const g = (out[site] ||= { site, name: titleCase(si.siteName), lat: si.geoLocation?.geogLocation?.latitude, lon: si.geoLocation?.geogLocation?.longitude });
    const last = vals[vals.length - 1];
    // Value ~24 h before the latest reading, for the trend.
    const dayAgo = Date.parse(last.t) - 864e5;
    const prev = vals.reduce((best, v) => (Math.abs(Date.parse(v.t) - dayAgo) < Math.abs(Date.parse(best.t) - dayAgo) ? v : best), vals[0]);
    if (code === "00060") { g.flow = last.v; g.flowPrev = Date.parse(last.t) - Date.parse(prev.t) > 12 * 36e5 ? prev.v : null; g.time = last.t; g.series = vals; }
    if (code === "00065") { g.stage = last.v; g.time ||= last.t; }
  }
  return out;
}
const titleCase = (s = "") => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Nr|Abv|Blw|At|Near|Above|Below)\b/g, (m) => m.toLowerCase()).replace(/\b(Nc|Tn|Va|Wv|Ga|Sc|Co|Ca|Or|Wa|Id|Mt|Wy|Ut|Az|Nm|Nh|Vt|Me|Ny|Pa|Md|Ky|Oh|Mi|Wi|Mn|Ar|Mo|Ok|Tx|Al|Ms|La|Fl|Nj|Ct|Ma|Ri|De)\b/g, (m) => m.toUpperCase());

// USGS daily-statistics RDB → { site: { p10, p25, p50, p75, p90 } } for one month/day.
export function parseStats(rdb, month, day) {
  const lines = rdb.split("\n").filter((l) => l && !l.startsWith("#"));
  if (lines.length < 3) return {};
  const head = lines[0].split("\t");
  const col = (n) => head.indexOf(n);
  const out = {};
  for (const l of lines.slice(2)) {
    const c = l.split("\t");
    if (+c[col("month_nu")] !== month || +c[col("day_nu")] !== day) continue;
    const site = c[col("site_no")];
    const p = {}; for (const k of ["p10", "p25", "p50", "p75", "p90"]) { const v = parseFloat(c[col(`${k}_va`)]); if (Number.isFinite(v)) p[k] = v; }
    if (p.p50 != null && !out[site]) out[site] = p;
  }
  return out;
}

// Where today's flow sits in the gauge's history for this date (0–100).
export function percentile(flow, p) {
  if (flow == null || !p?.p50) return null;
  const knots = [[10, p.p10], [25, p.p25], [50, p.p50], [75, p.p75], [90, p.p90]].filter(([, v]) => v != null);
  if (flow <= knots[0][1]) return Math.max(1, Math.round(knots[0][0] * flow / Math.max(knots[0][1], 1e-6)));
  for (let k = 1; k < knots.length; k++) {
    const [pa, va] = knots[k - 1], [pb, vb] = knots[k];
    if (flow <= vb) return Math.round(pa + ((flow - va) / Math.max(vb - va, 1e-6)) * (pb - pa));
  }
  const [pl, vl] = knots[knots.length - 1];
  return Math.min(99, Math.round(pl + 9 * Math.min(1, (flow / vl - 1) / 2)));
}

export const RATINGS = {
  flood:   { label: "Flood: stay off", color: "#b3261e", score: 5 },
  high:    { label: "High: experts only", color: "#d9793a", score: 40 },
  prime:   { label: "Good and lively", color: "#1f6feb", score: 90 },
  normal:  { label: "Normal", color: "#1f9d63", score: 75 },
  low:     { label: "Low: some scraping", color: "#c99a1c", score: 45 },
  verylow: { label: "Very low", color: "#8a7355", score: 15 },
  unknown: { label: "No history", color: "#8a96a3", score: null },
};
// Rating from percentile, bumped up a class when rising fast (rain on the way in).
export function rate(pct, flow, flowPrev) {
  if (pct == null) return "unknown";
  const rising = flowPrev ? flow / flowPrev : 1;
  if (pct >= 97 || (pct >= 90 && rising > 1.5)) return "flood";
  if (pct >= 88) return "high";
  if (pct >= 60) return "prime";
  if (pct >= 25) return "normal";
  if (pct >= 10) return "low";
  return "verylow";
}
export const trend = (flow, prev) => (!prev || !flow ? "" : flow / prev > 1.15 ? "rising" : flow / prev < 0.87 ? "falling" : "steady");

// USGS caps bounding boxes at 25 square degrees; shrink around the center if needed.
export function clampBox([w, s, e, n], maxArea = 24) {
  const area = (e - w) * (n - s);
  if (area <= maxArea) return [w, s, e, n].map((v) => +v.toFixed(4));
  const k = Math.sqrt(maxArea / area), cx = (w + e) / 2, cy = (s + n) / 2, hw = ((e - w) * k) / 2, hh = ((n - s) * k) / 2;
  return [cx - hw, cy - hh, cx + hw, cy + hh].map((v) => +v.toFixed(4));
}
