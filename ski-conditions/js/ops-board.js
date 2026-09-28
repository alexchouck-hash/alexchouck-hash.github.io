import { RESORTS } from "./resorts.js";
import { SURFACES, simulateSegments, skillWeights, dailySnow, days, virtualRuns } from "./model.js";
import { snowRange, snowQuality, snowmakingNights, windHolds, groomingPriorities, alerts, draftReport, LIFT_TYPES } from "./ops.js";
import { formatters, esc, dayLabel, todayAt } from "./fmt.js";
import * as api from "./api.js";

const $ = (s) => document.querySelector(s);
const byId = Object.fromEntries(RESORTS.map((r) => [r.id, r]));
const p = new URLSearchParams(location.search);
let id = byId[p.get("r")] ? p.get("r") : "vail";
let units = p.get("u") || (/^en-US/.test(navigator.language) ? "us" : "metric");
const F = formatters(() => units === "us");
let c;

$("#resort").innerHTML = RESORTS.map((r) => `<option value="${r.id}">${esc(r.name)} (${r.country})</option>`).join("");
$("#resort").value = id; $("#units").value = units;
$("#resort").onchange = (e) => { id = e.target.value; go(); };
$("#units").onchange = (e) => { units = e.target.value; render(); };

async function go() {
  history.replaceState(null, "", `?r=${id}&u=${units}`);
  const r = byId[id];
  $("#status").textContent = `Loading ${r.name}…`; $("#board").innerHTML = "";
  try {
    const v = await Promise.race([api.verification().catch(() => null), new Promise((res) => setTimeout(() => res(null), 4000))]);
    const [h, map] = await Promise.all([api.forecast(r, 30, skillWeights(v?.skill, r.id).weights), api.mapData(r).catch(() => ({ runs: [], lifts: [] }))]);
    if (byId[id] !== r) return;
    const runs = map.runs.length ? map.runs : virtualRuns(r);
    const sim = runs.map((run) => { const seg = simulateSegments(run, r, h); return { run, byDay: seg.mid }; });
    const mid = (r.base + r.summit) / 2;
    c = { r, h, runs, lifts: map.lifts, sim, days: days(h),
      snow: { base: dailySnow(h, r.base), mid: dailySnow(h, mid), summit: dailySnow(h, r.summit) },
      quality: snowQuality(h, r.summit),
      making: { base: snowmakingNights(h, r.base), mid: snowmakingNights(h, mid), summit: snowmakingNights(h, r.summit) },
      holds: map.lifts.map((l) => ({ l, d: windHolds(l, h) })) };
    $("#status").textContent = ""; render();
  } catch (e) { $("#status").textContent = `Could not load: ${e.message}`; }
}

const heat = (hours) => (hours >= 10 ? "#1f4fb3" : hours >= 6 ? "#2f7fd1" : hours >= 3 ? "#6aa6d8" : hours >= 1 ? "#a8c4dc" : "#c9cfd4");
function render() {
  if (!c) return;
  const { r, h } = c, today = todayAt(h), up = c.days.filter((d) => d >= today).slice(0, 10), tomorrow = up[1];
  const keys = up.slice(0, 3), sum = { snow: 0, perModel: {} };
  for (const k of keys) { const s = c.snow.summit[k]; sum.snow += s.snow; for (const [m, v] of Object.entries(s.perModel)) sum.perModel[m] = (sum.perModel[m] || 0) + v; }
  const range = snowRange(sum, 30);
  const best = c.sim.map((s) => ({ run: s.run, st: s.byDay[today]?.am })).filter((x) => x.st && x.st.surface !== "closed").sort((a, b) => b.st.score - a.st.score).slice(0, 3);
  const holdsToday = c.holds.map((x) => ({ name: x.l.name, ...(x.d[today] || { risk: "low" }) }));
  const makingTonight = c.making.mid.find((n) => n.date === today);
  const report = draftReport(r, { date: today, snow: c.snow, range, quality: c.quality[today], best, holds: holdsToday, making: makingTonight, fmt: F });
  const groom = groomingPriorities(c.sim, today, tomorrow, h).slice(0, 12);
  const al = alerts(c.snow).filter((a) => a.date >= today && a.date <= up[6]);
  const nights = up.slice(0, 10);
  const mk = (band) => Object.fromEntries(c.making[band].map((n) => [n.date, n]));
  const MK = { summit: mk("summit"), mid: mk("mid"), base: mk("base") };

  $("#board").innerHTML = `
  <div class="grid2">
    <div class="card"><h2>${esc(r.name)}: morning report draft</h2>
      <p class="small muted">Generated from today's forecast. Edit it before publishing.</p>
      <textarea id="report">${esc(report)}</textarea>
      <button class="noprint" id="copy" style="margin-top:6px">Copy report</button>
    </div>
    <div class="card"><h3>Storm outlook (summit)</h3>
      ${range ? `<p><b>${F.cm(range.p50)}</b> expected over 3 days (range ${F.cm(range.p10)}–${F.cm(range.p90)}), ${range.chance}% chance of 30 cm (12″) or more.</p>` : ""}
      <div class="scroll"><table><thead><tr><th>Day</th><th class="num">Summit</th><th class="num">Range</th><th class="num">Base</th><th>Type</th><th class="num">Snow line</th></tr></thead><tbody>
      ${up.map((d) => { const s = c.snow.summit[d], rg = snowRange(s), q = c.quality[d], noon = h.time.findIndex((t) => t === `${d}T12:00`); const fl = noon >= 0 ? h.freezing_level_height[noon] : null;
        return `<tr><td>${d === today ? "Today" : dayLabel(d)}</td><td class="num">${F.cm(s.snow)}</td><td class="num muted">${rg && rg.p90 >= 1 ? `${F.cm(rg.p10)}–${F.cm(rg.p90)}` : "–"}</td><td class="num">${F.cm(c.snow.base[d].snow)}${c.snow.base[d].rain > 1 ? " +rain" : ""}</td><td class="small">${q && q.snow >= 2 ? q.label : ""}</td><td class="num">${fl != null ? F.m(Math.max(0, fl - 250)) : "–"}</td></tr>`; }).join("")}
      </tbody></table></div>
      ${al.length ? al.map((a) => `<div class="alert"><b>${dayLabel(a.date)}:</b> ${esc(a.text)}</div>`).join("") : ""}
    </div>
    <div class="card"><h3>Snowmaking windows (hours per night)</h3>
      <p class="small muted">Hours with wet-bulb temperature at or below −2.5 °C (27.5 °F) between 5 pm and 9 am. The number in brackets is prime hours, at or below −6 °C (21 °F).</p>
      <div class="scroll"><table><thead><tr><th>Night of</th>${nights.map((d) => `<th class="num small">${dayLabel(d).replace(/,.*/, "")}<br>${d.slice(8)}</th>`).join("")}</tr></thead><tbody>
      ${[["summit", "Summit", r.summit], ["mid", "Mid", (r.base + r.summit) / 2], ["base", "Base", r.base]].map(([k, l, z]) => `<tr><th class="small">${l}<br><span class="muted">${F.m(z)}</span></th>${nights.map((d) => { const n = MK[k][d]; return `<td><div class="cell" style="background:${heat(n?.hours || 0)}" title="Coldest wet-bulb ${F.deg(n?.minTw)}">${n ? n.hours : "–"}${n?.prime ? ` <span style="font-weight:400">(${n.prime})</span>` : ""}</div></td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div>
    </div>
    <div class="card"><h3>Grooming priorities tonight</h3>
      <p class="small muted">Runs expected to end today in a poor surface, weighted by traffic. Refreezing slush and bumps rank higher.</p>
      ${groom.length ? `<div class="scroll"><table><thead><tr><th>Run</th><th>This afternoon</th><th class="num">Priority</th></tr></thead><tbody>
      ${groom.map((g) => `<tr><td>${esc(g.run.name)}${g.run.groomed ? "" : ' <span class="muted small">(usually ungroomed)</span>'}</td><td><span class="pill" style="background:${SURFACES[g.surface].color}">${esc(g.why)}</span></td><td class="num">${g.priority}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="small">No runs are flagged: surfaces should hold up tonight.</p>`}
    </div>
    <div class="card"><h3>Lift wind holds, next 3 days</h3>
      ${c.holds.length ? `<div class="scroll"><table><thead><tr><th>Lift</th>${up.slice(0, 3).map((d) => `<th>${d === today ? "Today" : dayLabel(d)}</th>`).join("")}</tr></thead><tbody>
      ${c.holds.map((x) => `<tr><td>${esc(x.l.name)} <span class="muted small">${LIFT_TYPES[x.l.type]?.label || ""}</span></td>${up.slice(0, 3).map((d) => { const v = x.d[d]; const col = { likely: "#c4553f", possible: "#c9a93a", low: "#2fa36b" }[v?.risk || "low"]; return `<td><span class="pill" style="background:${col}">${v?.risk || "–"}</span> <span class="small muted">${F.kmh(v?.maxGust)}</span></td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div>` : `<p class="small muted">No lifts are mapped in OpenStreetMap for this resort yet.</p>`}
    </div>
    <div class="card noprint"><h3>Put this forecast on your website</h3>
      <p class="small">Paste this snippet where you want the widget. It updates itself and works on any site.</p>
      <textarea readonly style="min-height:70px">&lt;iframe src="https://alexchouck-hash.github.io/ski-conditions/embed.html?r=${r.id}&amp;u=${units}" width="340" height="420" style="border:0;border-radius:12px" title="${esc(r.name)} snow forecast by Bluebird Snow" loading="lazy"&gt;&lt;/iframe&gt;</textarea>
      <p class="small"><a href="embed.html?r=${r.id}&u=${units}" target="_blank">Preview the widget</a> · <a href="for-resorts.html">Plans and access</a></p>
    </div>
  </div>`;
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText($("#report").value); $("#copy").textContent = "Copied"; } catch { $("#report").select(); } };
}
go();
