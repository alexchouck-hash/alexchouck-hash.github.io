// Minimal ERDDAP griddap client for the NOAA AOML sargassum (AFAI) products.
// Discovers variable/axis names from the dataset's /info page instead of
// hard-coding them, and summarizes a box around each coastal segment into
// ring × sector statistics.

import { RINGS, SECTORS, BOX_DEG, distBearing } from "../../js/sargassum/segments.js";

export const SERVER = process.env.ERDDAP_SERVER || "https://cwcgom.aoml.noaa.gov/erddap";
export const DATASETS = { d1: "noaa_aoml_atlantic_oceanwatch_AFAI_1D", d7: "noaa_aoml_atlantic_oceanwatch_AFAI_7D" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      const body = (await res.text()).slice(0, 300);
      if (res.status < 500 && res.status !== 429) throw Object.assign(new Error(`${res.status} ${url}\n${body}`), { fatal: true });
      if (i >= tries - 1) throw new Error(`${res.status} ${url}\n${body}`);
    } catch (e) {
      if (e.fatal || i >= tries - 1) throw e;
    }
    await sleep(3000 * 2 ** i);
  }
}

// ERDDAP writes spacing as e.g. "0.01", "-0.01", "1 day", "7 days", "1h 30m" or "86400".
// Time axes are in seconds; return seconds for time-like units, raw numbers otherwise.
export function parseSpacing(txt) {
  if (!txt) return NaN;
  const t = txt.trim();
  const units = { d: 86400, day: 86400, days: 86400, h: 3600, hr: 3600, hour: 3600, hours: 3600, m: 60, min: 60, minutes: 60, s: 1, sec: 1, seconds: 1 };
  const parts = [...t.matchAll(/(-?[\d.eE+-]+)\s*([a-zA-Z]+)?/g)];
  if (!parts.length) return NaN;
  if (parts.length === 1 && !parts[0][2]) return +parts[0][1];
  return parts.reduce((a, [, n, u]) => a + +n * (units[(u || "s").toLowerCase()] ?? 1), 0);
}

// Dataset metadata: axis names/order/spacing/range and the AFAI-like data variable.
export async function describe(id) {
  const j = JSON.parse(await fetchText(`${SERVER}/info/${id}/index.json`));
  const rows = j.table.rows;
  const dims = rows.filter((r) => r[0] === "dimension").map((r) => ({ name: r[1], info: r[4] }));
  const vars = rows.filter((r) => r[0] === "variable").map((r) => ({ name: r[1], dims: r[4] }));
  const attr = (v, a) => rows.find((r) => r[0] === "attribute" && r[1] === v && r[2] === a)?.[4];
  const axes = dims.map((d) => {
    const n = +(/nValues=(\d+)/.exec(d.info)?.[1] ?? 0);
    const spacing = parseSpacing(/averageSpacing=([^,]+)/.exec(d.info)?.[1]);
    const range = String(attr(d.name, "actual_range") ?? "").split(/,\s*/).map(Number);
    // Fall back to range / (n - 1) when the spacing text is missing or unparseable.
    const sp = Number.isFinite(spacing) ? spacing : range.length === 2 && n > 1 ? (range[1] - range[0]) / (n - 1) : NaN;
    return { name: d.name, n, spacing: sp, range, evenlySpaced: /evenlySpaced=true/.test(d.info), rawInfo: d.info };
  });
  const dataVar = vars.find((v) => /afai|sarg|fa_|density/i.test(v.name)) ?? vars[0];
  return { id, axes, vars, dataVar: dataVar?.name, units: attr(dataVar?.name, "units"), fill: attr(dataVar?.name, "_FillValue") };
}

const axisOf = (meta, re) => meta.axes.find((a) => re.test(a.name));

// Build a griddap CSV query for a box and a time range with strides. AFAI pixels
// are ~1.7 km; sampling every ~8 km keeps a full-history backfill to a few GB
// while the 0–20 km ring still gets a dozen-plus pixels.
export function boxQuery(meta, { lat, lon, t0, t1, timeStride = 1, pixelKm = 8 }) {
  const la = axisOf(meta, /^lat/i), lo = axisOf(meta, /^lon/i), ti = axisOf(meta, /^time/i);
  const degPerPx = Math.abs(la.spacing) || 0.01;
  const stride = Math.max(1, Math.round(pixelKm / 111 / degPerPx));
  // Respect the axis order ERDDAP stores (ascending or descending latitude).
  const latDesc = la.range.length === 2 && la.spacing < 0;
  const [a, b] = latDesc ? [lat + BOX_DEG, lat - BOX_DEG] : [lat - BOX_DEG, lat + BOX_DEG];
  const sel = meta.axes.map((ax) => {
    if (ax === ti) return `[(${t0}):${timeStride}:(${t1})]`;
    if (ax === la) return `[(${a.toFixed(3)}):${stride}:(${b.toFixed(3)})]`;
    if (ax === lo) return `[(${(lon - BOX_DEG).toFixed(3)}):${stride}:(${(lon + BOX_DEG).toFixed(3)})]`;
    return "[0]"; // e.g. altitude
  }).join("");
  return `${SERVER}/griddap/${meta.id}.csv?${meta.dataVar}${sel}`;
}

const q = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);

// CSV (two header rows) -> per-time ring×sector stats relative to the segment center.
export function summarize(csv, meta, { lat, lon }) {
  const lines = csv.trim().split("\n");
  const head = lines[0].split(",");
  const iT = head.findIndex((h) => /^time/i.test(h)), iLa = head.findIndex((h) => /^lat/i.test(h)), iLo = head.findIndex((h) => /^lon/i.test(h)), iV = head.indexOf(meta.dataVar);
  const byTime = new Map();
  for (let k = 2; k < lines.length; k++) {
    const c = lines[k].split(",");
    const t = c[iT].slice(0, 10);
    if (!byTime.has(t)) byTime.set(t, RINGS.map(() => Array.from({ length: SECTORS }, () => ({ vals: [], total: 0 }))));
    const [km, brg] = distBearing(lat, lon, +c[iLa], +c[iLo]);
    const ri = RINGS.findIndex(([r0, r1]) => km >= r0 && km < r1);
    if (ri < 0) continue;
    const cell = byTime.get(t)[ri][Math.floor(((brg + 360 / SECTORS / 2) % 360) / (360 / SECTORS))];
    cell.total++;
    const v = c[iV] === "NaN" || c[iV] === "" ? NaN : +c[iV];
    if (Number.isFinite(v) && (meta.fill == null || v !== +meta.fill)) cell.vals.push(v);
  }
  return [...byTime].map(([date, rings]) => ({
    date,
    rings: rings.map((sectors) => sectors.map(({ vals, total }) => {
      vals.sort((x, y) => x - y);
      return { n: vals.length, total, p50: q(vals, 0.5), p90: q(vals, 0.9), p99: q(vals, 0.99) };
    })),
  }));
}
