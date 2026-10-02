// Weekly fantasy projections: nflverse usage baseline x market game environment.
// Lines: nflverse games.csv (consensus sportsbook spread/total), blended with Kalshi
// (game-winner and total markets, public API, no key) when its markets are open.
// Writes fantasy/projections.json on the data-feed branch.
import { mkdir, writeFile } from "node:fs/promises";
import { STATS, baseline, volatility, environment, project, points, impliedPoints, spreadFromWinProb, medianFromLadder } from "../model.js";

const root = new URL((process.env.FEED_DIR || "feed").replace(/\/?$/, "/") + "fantasy/", new URL("../../", import.meta.url));
const NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_";
const GAMES = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
const LEAGUE_PTS = 22.5;
// Kalshi codes -> nflverse codes (nflverse uses LA for the Rams).
const ALIAS = { LAR: "LA", JAC: "JAX", WSH: "WAS", LVR: "LV", OAK: "LV", SD: "LAC", STL: "LA" };

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const num = (x) => (x === "" || x == null || x === "NA" ? 0 : Number(x) || 0);
export function statLine(r) {
  return {
    pass_att: num(r.attempts), pass_yds: num(r.passing_yards), pass_td: num(r.passing_tds), pass_int: num(r.passing_interceptions),
    carries: num(r.carries), rush_yds: num(r.rushing_yards), rush_td: num(r.rushing_tds),
    targets: num(r.targets), rec: num(r.receptions), rec_yds: num(r.receiving_yards), rec_td: num(r.receiving_tds),
    fumbles: num(r.rushing_fumbles_lost) + num(r.receiving_fumbles_lost) + num(r.sack_fumbles_lost),
  };
}

async function text(url) {
  const r = await fetch(url, { headers: { "user-agent": "fantasy-feed" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// ---- Kalshi -------------------------------------------------------------------
const price = (m) => {
  const c = (k) => (m[k + "_dollars"] != null ? Number(m[k + "_dollars"]) : m[k] != null ? m[k] / 100 : NaN);
  const bid = c("yes_bid"), ask = c("yes_ask"), last = c("last_price");
  if (bid > 0 && ask > 0 && ask - bid <= 0.1) return (bid + ask) / 2; // skip wide, illiquid books
  return last > 0 && last < 1 ? last : NaN;
};
const code = (t) => ALIAS[t] || t;

async function kalshiEvents(series) {
  const out = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const r = await fetch(`${KALSHI}/events?series_ticker=${series}&status=open&with_nested_markets=true&limit=200${cursor ? "&cursor=" + cursor : ""}`);
    if (!r.ok) throw new Error(`kalshi ${series} ${r.status}`);
    const j = await r.json();
    out.push(...(j.events || []));
    if (!(cursor = j.cursor)) break;
  }
  return out;
}

// Event tickers look like KXNFLGAME-26OCT04TENBAL: date then away+home codes.
export function matchGame(eventTicker, games) {
  const tail = eventTicker.split("-")[1]?.slice(7) || "";
  return games.find((g) => {
    const away = [g.away_team, ...Object.keys(ALIAS).filter((k) => ALIAS[k] === g.away_team)];
    const home = [g.home_team, ...Object.keys(ALIAS).filter((k) => ALIAS[k] === g.home_team)];
    return away.some((a) => home.some((h) => tail === a + h));
  });
}

async function kalshiLines(games) {
  const lines = new Map();
  const get = (g) => lines.get(g.game_id) || (lines.set(g.game_id, {}), lines.get(g.game_id));
  for (const ev of await kalshiEvents("KXNFLGAME")) {
    const g = matchGame(ev.event_ticker, games);
    const m = g && (ev.markets || []).find((m) => code(m.ticker.split("-").pop()) === g.home_team);
    const p = m && price(m);
    if (Number.isFinite(p)) get(g).winProbHome = p;
  }
  try {
    for (const ev of await kalshiEvents("KXNFLTOTAL")) {
      const g = matchGame(ev.event_ticker, games);
      if (!g) continue;
      const t = medianFromLadder((ev.markets || []).map((m) => ({ strike: Number(m.floor_strike), pOver: price(m) })));
      if (t) get(g).total = t;
    }
  } catch (e) { console.warn("kalshi totals:", e.message); }
  return lines;
}

// ---- Build ----------------------------------------------------------------------
export function upcomingWeek(games, today) {
  const reg = games.filter((g) => g.game_type === "REG" && g.home_score === "" && g.gameday >= today);
  if (!reg.length) return null;
  const season = Math.min(...reg.map((g) => +g.season));
  const week = Math.min(...reg.filter((g) => +g.season === season).map((g) => +g.week));
  return { season, week };
}

function teamScoring(games, season, week) {
  const byTeam = {};
  const played = games.filter((g) => g.home_score !== "" && (+g.season < season || +g.week < week || g.game_type !== "REG") && +g.season >= season - 1)
    .sort((a, b) => a.gameday.localeCompare(b.gameday));
  for (const g of played) {
    (byTeam[g.home_team] ||= []).push(+g.home_score);
    (byTeam[g.away_team] ||= []).push(+g.away_score);
  }
  const avg = {};
  for (const [t, s] of Object.entries(byTeam)) {
    let w = 1, ws = 3, acc = 3 * LEAGUE_PTS; // shrink toward league average
    for (let i = s.length - 1; i >= 0 && i >= s.length - 10; i--, w *= 0.8) { acc += w * s[i]; ws += w; }
    avg[t] = acc / ws;
  }
  return avg;
}

export async function build({ today = new Date().toISOString().slice(0, 10), weekOverride } = {}) {
  const games = parseCSV(await text(GAMES));
  const up = weekOverride || upcomingWeek(games, today);
  if (!up) throw new Error("no upcoming regular-season games");
  const { season, week } = up;
  const slate = games.filter((g) => +g.season === season && +g.week === week && g.game_type === "REG");

  const [cur, prev] = await Promise.all([season, season - 1].map((s) => text(NFLVERSE + s + ".csv").then(parseCSV).catch(() => [])));
  const thisYear = cur.filter((r) => r.season_type === "REG" && +r.week < week && POSITIONS.has(r.position));
  const lastYear = prev.filter((r) => POSITIONS.has(r.position));

  let kalshi = new Map(), kalshiStatus = "ok";
  try { kalshi = await kalshiLines(slate); } catch (e) { kalshiStatus = e.message; console.warn("kalshi:", e.message); }

  const env = {};
  const lines = slate.map((g) => {
    const vegas = { spread: g.spread_line === "" ? null : +g.spread_line, total: g.total_line === "" ? null : +g.total_line };
    const k = kalshi.get(g.game_id) || {};
    const ks = Number.isFinite(k.winProbHome) ? spreadFromWinProb(k.winProbHome) : null;
    const pick = (a, b) => (a != null && b != null ? (a + b) / 2 : a ?? b);
    const spread = pick(vegas.spread, ks), total = pick(vegas.total, k.total ?? null);
    const line = { game_id: g.game_id, gameday: g.gameday, gametime: g.gametime, away: g.away_team, home: g.home_team, roof: g.roof, vegas, kalshi: { winProbHome: k.winProbHome ?? null, spread: ks, total: k.total ?? null }, spread, total };
    if (spread != null && total != null) {
      const ip = impliedPoints(total, spread);
      Object.assign(line, { impliedHome: ip.home, impliedAway: ip.away });
      env[g.home_team] = { implied: ip.home, favoredBy: spread, opp: g.away_team, home: true, game_id: g.game_id };
      env[g.away_team] = { implied: ip.away, favoredBy: -spread, opp: g.home_team, home: false, game_id: g.game_id };
    }
    return line;
  });

  const teamAvg = teamScoring(games, season, week);
  // Team games played so far this season, newest last, to judge whether a player is active.
  const teamWeeks = {};
  for (const r of thisYear) (teamWeeks[r.team] ||= new Set()).add(+r.week);

  // One QB per team: whoever threw the most passes in the team's latest game.
  const starter = {};
  for (const r of thisYear) if (r.position === "QB") {
    const cur = starter[r.team];
    if (!cur || +r.week > cur.week || (+r.week === cur.week && num(r.attempts) > cur.att)) starter[r.team] = { id: r.player_id, week: +r.week, att: num(r.attempts) };
  }
  const byPlayer = new Map();
  for (const r of thisYear) (byPlayer.get(r.player_id) || byPlayer.set(r.player_id, []).get(r.player_id)).push(r);
  const prior = new Map();
  for (const r of lastYear) (prior.get(r.player_id) || prior.set(r.player_id, []).get(r.player_id)).push(statLine(r));

  const players = [];
  for (const [id, rows] of byPlayer) {
    rows.sort((a, b) => +a.week - +b.week);
    const last = rows.at(-1), team = last.team, e = env[team];
    if (!e) continue; // bye week or no line yet
    const recent = [...(teamWeeks[team] || [])].sort((a, b) => a - b).slice(-2);
    if (!recent.includes(+last.week)) continue; // missed the team's last two games
    if (last.position === "QB" && starter[team]?.id !== id) continue;
    const gl = rows.map(statLine);
    const p = prior.get(id);
    const priorLine = p ? Object.fromEntries(STATS.map((k) => [k, p.reduce((s, g) => s + g[k], 0) / p.length])) : null;
    const base = baseline(gl, priorLine);
    const m = environment(last.position, e.implied, teamAvg[team] || LEAGUE_PTS, e.favoredBy);
    const proj = project(base, last.position, m);
    const half = points(proj, "half");
    if (half < 2) continue;
    const sd = Math.max(volatility(gl, "half") ?? 0, 0.45 * half, 3);
    const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
    players.push({
      id, name: last.player_display_name, pos: last.position, team, opp: e.opp, home: e.home, headshot: last.headshot_url || null,
      games: gl.length, implied: Math.round(e.implied * 10) / 10, teamAvg: Math.round((teamAvg[team] || LEAGUE_PTS) * 10) / 10,
      envMult: Math.round(m.env * 1000) / 1000, scriptTilt: Math.round((m.rush - 1) * 1000) / 1000,
      share: { targets: num(last.target_share), wopr: num(last.wopr) },
      baseline: round(base), proj: round(proj), sdHalf: Math.round(sd * 10) / 10,
    });
  }
  players.sort((a, b) => points(b.proj) - points(a.proj));
  return { generated: new Date().toISOString(), season, week, sources: { nflverse: "ok", kalshi: kalshiStatus }, games: lines, players };
}

if (process.env.FANTASY_NO_MAIN !== "1") {
  const week = process.env.WEEK && process.env.SEASON ? { season: +process.env.SEASON, week: +process.env.WEEK } : undefined;
  const out = await build({ weekOverride: week });
  await mkdir(root, { recursive: true });
  await writeFile(new URL("projections.json", root), JSON.stringify(out));
  console.log(`fantasy: ${out.season} wk ${out.week}, ${out.games.length} games, ${out.players.length} players, kalshi=${out.sources.kalshi}`);
}
