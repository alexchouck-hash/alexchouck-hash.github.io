import { points } from "./model.js";

const FEED = "https://raw.githubusercontent.com/alexchouck-hash/alexchouck-hash.github.io/data-feed/fantasy/projections.json";
const $ = (id) => document.getElementById(id);
const state = { fmt: "half", pos: "", q: "", sort: "pts", dir: -1 };
let data;
try { state.fmt = localStorage.getItem("fantasy-fmt") || "half"; } catch {}

const fmt1 = (x) => (x == null ? "–" : x.toFixed(1));
const sign = (x) => (x > 0 ? "+" : "") + x;

function rows() {
  const q = state.q.toLowerCase();
  return data.players
    .filter((p) => !state.pos || (state.pos === "FLEX" ? p.pos !== "QB" : p.pos === state.pos))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q)
    .map((p) => {
      const pts = points(p.proj, state.fmt), sd = p.sdHalf * (pts / Math.max(points(p.proj, "half"), 1));
      const opp = p.pos === "QB" ? p.proj.pass_att : p.proj.targets + (p.pos === "RB" ? p.proj.carries : 0);
      return { ...p, pts, floor: Math.max(0, pts - 1.28 * sd), ceil: pts + 1.28 * sd, env: p.envMult, matchup: (p.home ? "vs " : "@ ") + p.opp, opp };
    })
    .sort((a, b) => (typeof a[state.sort] === "string" ? a[state.sort].localeCompare(b[state.sort]) : a[state.sort] - b[state.sort]) * state.dir);
}

function render() {
  $("rows").innerHTML = rows().slice(0, 200).map((p) => {
    const d = Math.round((p.env - 1) * 100);
    return `<tr><td><span class="name">${p.name}</span><span class="pos">${p.pos} · ${p.team}</span></td><td class="muted">${p.matchup}</td>
      <td class="pts">${fmt1(p.pts)}</td><td class="muted">${fmt1(p.floor)}</td><td class="muted">${fmt1(p.ceil)}</td>
      <td class="${d > 0 ? "up" : d < 0 ? "down" : "muted"}">${d ? sign(d) + "%" : "0%"}</td><td>${fmt1(p.implied)}</td><td class="muted">${fmt1(p.opp)}</td></tr>`;
  }).join("") || `<tr><td colspan="8" class="muted">No players match.</td></tr>`;
}

function renderGames() {
  $("games").innerHTML = data.games.map((g) => {
    const k = g.kalshi.winProbHome != null ? `Kalshi: ${g.home} ${Math.round(g.kalshi.winProbHome * 100)}%${g.kalshi.total ? `, total ${fmt1(g.kalshi.total)}` : ""}` : "Kalshi: no market";
    const fav = g.spread == null ? "" : g.spread > 0 ? `${g.home} −${fmt1(g.spread)}` : `${g.away} −${fmt1(-g.spread)}`;
    return `<div class="game"><div>${g.away} <b>${fmt1(g.impliedAway)}</b> @ ${g.home} <b>${fmt1(g.impliedHome)}</b></div>
      <div class="src">${fav}${g.total != null ? ` · O/U ${fmt1(g.total)}` : ""} · ${g.gameday}</div><div class="src">${k}</div></div>`;
  }).join("");
}

async function load() {
  for (const url of [FEED, "../feed/fantasy/projections.json"]) {
    try { const r = await fetch(url, { cache: "no-cache" }); if (r.ok) return r.json(); } catch {}
  }
  throw new Error("feed unavailable");
}

load().then((j) => {
  data = j;
  const k = j.sources.kalshi === "ok" ? "Kalshi + sportsbook lines" : "sportsbook lines (Kalshi unavailable)";
  $("meta").textContent = `${j.season} Week ${j.week} · ${j.players.length} players · ${k} · updated ${new Date(j.generated).toLocaleString()}`;
  $("fmt").value = state.fmt;
  render(); renderGames();
}).catch((e) => { $("meta").textContent = "Couldn't load projections: " + e.message; });

$("fmt").onchange = (e) => { state.fmt = e.target.value; try { localStorage.setItem("fantasy-fmt", state.fmt); } catch {} render(); };
$("pos").onchange = (e) => { state.pos = e.target.value; render(); };
$("q").oninput = (e) => { state.q = e.target.value; render(); };
document.querySelectorAll("th[data-k]").forEach((th) => th.onclick = () => {
  const k = th.dataset.k; state.dir = state.sort === k ? -state.dir : k === "name" || k === "matchup" ? 1 : -1; state.sort = k; render();
});
