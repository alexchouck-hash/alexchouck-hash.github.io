# Fantasy projections

Weekly QB/RB/WR/TE projections at `/fantasy/`, from two layers:

1. **Usage baseline** (`model.js` `baseline`): recency-weighted per-game stat line from nflverse weekly stats, shrunk toward last season.
2. **Game environment** (`environment`): market-implied team points (sportsbook spread/total from nflverse `games.csv`, averaged with Kalshi game-winner and total markets when open) divided by the team's recent scoring, plus a small game-script tilt.

`scripts/build-fantasy.mjs` runs in `.github/workflows/data.yml` and writes `fantasy/projections.json` on the `data-feed` branch. Override the week with `SEASON=2026 WEEK=5`. Tests: `node fantasy/tests/test.mjs`.
