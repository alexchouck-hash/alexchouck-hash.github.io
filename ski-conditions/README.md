# Run-by-Run Snow Forecast

Static page (`/ski-conditions/`) forecasting snow surface conditions on every run at 62 major ski resorts worldwide, for the next 10 days. Everything is fetched live in the browser from key-less, free APIs.

- `js/resorts.js`: resort catalog (coordinates, base/summit elevation, treeline, run search radius). Values are approximate.
- `js/api.js`: Open-Meteo hourly forecast from ECMWF, GFS, ICON and GEM (plus 7 past days), Open-Meteo elevation, OpenStreetMap runs via Overpass.
- `js/model.js`: the snow model (pure functions).
- `js/ops.js`: deeper products (pure functions): snowfall ranges and powder-day chance from model spread, snow quality from snow-to-liquid ratio, snowmaking windows from wet-bulb temperature, lift wind holds (OSM aerialways), grooming priorities, alerts and a drafted snow report.
- `ops.html` + `js/ops-board.js`: Resort Ops Board for resort teams (printable).
- `embed.html`: embeddable widget for resort websites (`?r=<resort id>&u=us|metric`).
- `for-resorts.html`: product, plans and advertising page. Contact goes through GitHub issues until an inbox exists.
- `sponsors.json`: direct-sold sponsor slots, shown on resort pages. Entries: `{ name, text, url, image?, resorts?: [ids], regions?: [names], active? }`. Empty = house ad.
- `js/app.js`: map, resort summary, per-run table, global snowfall leaderboard.
- `scripts/verify.mjs`: daily verification against SNOTEL stations, run by `.github/workflows/data.yml`; publishes `ski/verification.json` and `ski/forecasts/` on the `data-feed` branch.
- `scripts/build-runs.mjs`: precomputes each resort's runs weekly (up to 15 resorts per feed run) into `ski/runs/<id>.json` on `data-feed`; the page falls back to live OpenStreetMap when a file is missing.
- `scripts/build-climate.mjs`: season context per resort (10 seasons of ERA5 at summit elevation): weekly normals, season-to-date and % of normal → `ski/climate/<id>.json`.
- `scripts/build-forecasts.mjs`: public JSON forecast feed for every resort → `ski/forecast/index.json` and `ski/forecast/<id>.json`.
- `scripts/test-model.mjs`: offline physics and parsing checks (`node ski-conditions/scripts/test-model.mjs`).

## Model

1. Blend the four global models hourly, plus high-resolution regional models at double weight where they cover the resort (HRRR, HRDPS, AROME, ICON-D2, JMA MSM, fetched in a separate optional request). Spread among the global models on 3-day summit snowfall sets confidence.
2. Each OSM run gets top, bottom, aspect (downhill bearing) and slope from 5 elevation samples. Resorts with no mapped runs fall back to 12 virtual slopes (3 elevation bands × 4 aspects).
3. At each run's top, middle and bottom (15% in from each end; runs under 120 m of drop use one segment), hour by hour:
   - temperature from a lapse rate fitted to the freezing level; rain/snow split between −0.2 and 2.2 °C; Kuchera snow-to-liquid ratio; +4% precipitation per 100 m;
   - wind loading on lee aspects and scouring on windward ones, weighted by whether the run tops out above treeline;
   - solar radiation on the slope from the real sun position drives melt, melt-freeze crusts and corn;
   - grooming at 04:00 on groomed runs, skier traffic 09:00–16:00 by difficulty;
   - snow depth starts from the model's snow depth, adjusted for elevation, then accumulates and melts.
4. The state is classified into a surface (deep powder, corduroy, corn, crust, ice…) and scored 0–100.

## Verification

Once a day, `verify.mjs` pairs each resort with the nearest SNOTEL station (within 20 km, preferring stations inside the resort's elevation range), saves the forecast daily snowfall at that station's elevation for the blend and every model, and scores all saved forecasts from the last 60 days against observed snow-depth gain by lead time (1 to 5 days): mean absolute error, bias, and hit and false-alarm rates for days with 5 cm or more. Depth gain undercounts snowfall slightly because new snow settles. Coverage is US resorts for now.

## Skill-weighted blend

`verify.mjs` also publishes `skill`: each model's error over days 1 and 2, across all stations and per resort. Once at least two models have enough scored days (10 at the resort's own station, otherwise 30 across all stations), each model's weight becomes 1 / (error + 1 cm), scaled so the weights average 1 and kept between 0.4 and 2.5. Until then, global models count once and regional models twice. The page and the daily snapshot use the same weights, so the verified "blend" is the forecast visitors saw.

## Bias correction

`verify.mjs` also learns each resort's systematic snowfall bias from days 1–2 at its SNOTEL station. It compares raw (uncorrected) forecasts with observed depth gain, scaled up 15% because settling makes depth gain undercount snowfall. After at least 20 scored days and 20 cm of forecast snow, the factor is `1 + (ratio − 1) · n / (n + 40)`, capped between 0.75 and 1.3. It multiplies precipitation in the blend and in every model, so ranges stay consistent. Snapshots store both the corrected and the raw forecast, so the correction never trains on itself.

## Public forecast feed (JSON API)

Base URL: `https://raw.githubusercontent.com/alexchouck-hash/alexchouck-hash.github.io/data-feed/ski/`. Rebuilt every 6 hours, no key.

- `forecast/index.json`: `{ schema, updated, resorts: [{ id, name, country, region, todaySummitCm, next3SummitCm, powderChancePct, runsOpenPct, url }] }`
- `forecast/<id>.json`:
  - `resort`: id, name, country, region, lat, lon, baseM, summitM
  - `models`: `[{ id, label, weight }]`; `biasCorrection`: precipitation factor applied (1 = none)
  - `climate`: `{ toDate, through, normalToDate, pctOfNormal }` season snowfall in cm, or null
  - `days[]` (10): `date`; `summit` { snowCm, p10, p50, p90, powderChancePct, quality, tMinC, tMaxC, windMaxKmh }; `mid` { snowCm }; `base` { snowCm, rainMm }; `snowLineM`; `snowmakingHours` { base, mid, summit: { hours, prime } | null }; `runsOpenPct`; `bestRuns` [{ name, surface, score }]; `liftWindHolds` { likely: [names], possible: [names] }
  - `runsToday[]`: { name, difficulty, groomed, virtual, am: { surface, score }, pm: { surface, score } }
  - `surfaces`: surface id → label
- `climate/<id>.json`: `season`, `thisWeek` { index, normal }, `normals` { seasons, weekly[52], cumulative[366] } (cm, summit, ERA5; use as relative)
- `verification.json`, `runs/<id>.json`: accuracy scores and trail maps (see above).

`schema` increments on breaking changes.

## Next steps

- Add ground truth outside the US (resort snow reports, Canadian and European station networks).
