// Pure projection model shared by the feed builder and the browser page.
// Projection = usage baseline (recency-weighted, shrunk to last season) x game environment
// (market-implied team points vs. the team's recent scoring) x game-script tilt.

export const STATS = ["pass_att", "pass_yds", "pass_td", "pass_int", "carries", "rush_yds", "rush_td", "targets", "rec", "rec_yds", "rec_td", "fumbles"];
export const SCORING = {
  standard: { pass_yds: 0.04, pass_td: 4, pass_int: -2, rush_yds: 0.1, rush_td: 6, rec: 0, rec_yds: 0.1, rec_td: 6, fumbles: -2 },
  half: { pass_yds: 0.04, pass_td: 4, pass_int: -2, rush_yds: 0.1, rush_td: 6, rec: 0.5, rec_yds: 0.1, rec_td: 6, fumbles: -2 },
  ppr: { pass_yds: 0.04, pass_td: 4, pass_int: -2, rush_yds: 0.1, rush_td: 6, rec: 1, rec_yds: 0.1, rec_td: 6, fumbles: -2 },
};
export const DECAY = 0.75;        // weight of each older game relative to the next newer one
export const PRIOR_GAMES = 3;     // last season's per-game line counts as this many games
export const ELASTICITY = { QB: 0.8, RB: 0.6, WR: 0.7, TE: 0.6 }; // how much output tracks implied points
export const SPREAD_SD = 13.5;    // NFL margin standard deviation, for win prob <-> spread

export function points(line, fmt = "half") {
  const w = SCORING[fmt];
  return Object.entries(w).reduce((s, [k, v]) => s + (line[k] || 0) * v, 0);
}

// Market lines -> implied points. spread is home margin (positive = home favored), like nflverse.
export function impliedPoints(total, homeSpread) {
  return { home: (total + homeSpread) / 2, away: (total - homeSpread) / 2 };
}

// Acklam-style inverse normal CDF, enough precision for converting win probability to a spread.
export function invNorm(p) {
  p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? -Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q === null) {
    const r = (p - 0.5) ** 2, x = p - 0.5;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * x) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const s = p < 0.5 ? 1 : -1;
  return s * (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
export const spreadFromWinProb = (pHome) => SPREAD_SD * invNorm(pHome);

// Price where an "over X" ladder crosses 50%: the market's median total.
export function medianFromLadder(rungs) {
  const r = rungs.filter((x) => Number.isFinite(x.strike) && Number.isFinite(x.pOver)).sort((a, b) => a.strike - b.strike);
  for (let i = 1; i < r.length; i++) {
    const [lo, hi] = [r[i - 1], r[i]];
    if (lo.pOver >= 0.5 && hi.pOver <= 0.5) return lo.pOver === hi.pOver ? (lo.strike + hi.strike) / 2 : lo.strike + ((lo.pOver - 0.5) / (lo.pOver - hi.pOver)) * (hi.strike - lo.strike);
  }
  return null;
}

// games: oldest -> newest stat lines for one player. prior: last season per-game line or null.
export function baseline(games, prior) {
  let wsum = 0, w = 1;
  const acc = Object.fromEntries(STATS.map((k) => [k, 0]));
  for (let i = games.length - 1; i >= 0; i--, w *= DECAY) {
    for (const k of STATS) acc[k] += w * (games[i][k] || 0);
    wsum += w;
  }
  if (prior) { for (const k of STATS) acc[k] += PRIOR_GAMES * (prior[k] || 0); wsum += PRIOR_GAMES; }
  return wsum ? Object.fromEntries(STATS.map((k) => [k, acc[k] / wsum])) : null;
}

// Weighted spread of a player's own fantasy points, floored so rookies don't get fake certainty.
export function volatility(games, fmt = "half") {
  if (games.length < 2) return null;
  let w = 1, ws = 0, m = 0, v = 0;
  const pts = games.map((g) => points(g, fmt)).reverse();
  for (const p of pts) { ws += w; m += w * p; w *= DECAY; }
  m /= ws; w = 1;
  for (const p of pts) { v += w * (p - m) ** 2; w *= DECAY; }
  return Math.sqrt(v / ws);
}

// Multipliers applied to the baseline line. favoredBy > 0 when the player's team is favored.
export function environment(pos, implied, teamAvg, favoredBy) {
  const env = teamAvg > 0 ? Math.pow(implied / teamAvg, ELASTICITY[pos] ?? 0.6) : 1;
  const tilt = Math.max(-0.08, Math.min(0.08, favoredBy * 0.006)); // ~0.6% per point, capped
  return { env: Math.max(0.6, Math.min(1.5, env)), rush: 1 + tilt, pass: 1 - tilt };
}

export function project(base, pos, envm) {
  const out = {};
  for (const k of STATS) {
    const script = k.startsWith("pass") || ["targets", "rec", "rec_yds", "rec_td"].includes(k) ? envm.pass : k.startsWith("rush") || k === "carries" ? envm.rush : 1;
    out[k] = base[k] * envm.env * script;
  }
  return out;
}
