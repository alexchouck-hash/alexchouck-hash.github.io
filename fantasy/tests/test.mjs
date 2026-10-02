// node fantasy/tests/test.mjs
import assert from "node:assert/strict";
import { points, impliedPoints, spreadFromWinProb, medianFromLadder, baseline, environment } from "../model.js";
process.env.FANTASY_NO_MAIN = "1";
const { parseCSV, matchGame, upcomingWeek } = await import("../scripts/build-fantasy.mjs");

assert.deepEqual(impliedPoints(42.5, 11.5), { home: 27, away: 15.5 });
assert.equal(points({ rec: 5, rec_yds: 60, rec_td: 1 }, "ppr"), 17);
assert.equal(points({ rec: 5, rec_yds: 60, rec_td: 1 }, "half"), 14.5);
assert.ok(Math.abs(spreadFromWinProb(0.5)) < 1e-6);
assert.ok(Math.abs(spreadFromWinProb(0.75) - 9.1) < 0.1);
assert.equal(medianFromLadder([{ strike: 40.5, pOver: 0.7 }, { strike: 43.5, pOver: 0.5 }, { strike: 46.5, pOver: 0.3 }]), 43.5);
assert.equal(medianFromLadder([{ strike: 40, pOver: 0.6 }, { strike: 44, pOver: 0.4 }]), 42);
// newest game weighs most; prior pulls toward last season
const b = baseline([{ targets: 2 }, { targets: 10 }], null);
assert.ok(b.targets > 6 && b.targets < 10);
assert.ok(baseline([{ targets: 10 }], { targets: 4 }).targets < 6);
const e = environment("WR", 27, 22.5, 11.5);
assert.ok(e.env > 1 && e.rush > 1 && e.pass < 1);
assert.deepEqual(parseCSV('a,b\n"x, y",2\n'), [{ a: "x, y", b: "2" }]);
const games = [{ away_team: "LA", home_team: "JAX" }, { away_team: "TEN", home_team: "BAL" }];
assert.equal(matchGame("KXNFLGAME-26OCT04TENBAL", games), games[1]);
assert.equal(matchGame("KXNFLGAME-26OCT04LARJAC", games), games[0]);
assert.deepEqual(upcomingWeek([{ game_type: "REG", home_score: "", gameday: "2026-10-04", season: "2026", week: "4" }, { game_type: "REG", home_score: "", gameday: "2026-10-11", season: "2026", week: "5" }], "2026-10-02"), { season: 2026, week: 4 });
console.log("fantasy tests passed");
