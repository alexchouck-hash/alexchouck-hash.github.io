# Run-by-Run Snow Forecast

Static page (`/ski-conditions/`) forecasting snow surface conditions on every run at 62 major ski resorts worldwide, for the next 10 days. Everything is fetched live in the browser from key-less, free APIs.

- `js/resorts.js`: resort catalog (coordinates, base/summit elevation, treeline, run search radius). Values are approximate.
- `js/api.js`: Open-Meteo hourly forecast from ECMWF, GFS, ICON and GEM (plus 7 past days), Open-Meteo elevation, OpenStreetMap runs via Overpass.
- `js/model.js`: the snow model (pure functions).
- `js/app.js`: map, resort summary, per-run table, global snowfall leaderboard.
- `scripts/test-model.mjs`: offline physics and parsing checks (`node ski-conditions/scripts/test-model.mjs`).

## Model

1. Blend the four models hourly; their spread on 3-day summit snowfall sets confidence.
2. Each OSM run gets top, bottom, aspect (downhill bearing) and slope from 5 elevation samples. Resorts with no mapped runs fall back to 12 virtual slopes (3 elevation bands × 4 aspects).
3. At each run's mid elevation, hour by hour:
   - temperature from a lapse rate fitted to the freezing level; rain/snow split between −0.2 and 2.2 °C; Kuchera snow-to-liquid ratio; +4% precipitation per 100 m;
   - wind loading on lee aspects and scouring on windward ones, weighted by whether the run tops out above treeline;
   - solar radiation on the slope from the real sun position drives melt, melt-freeze crusts and corn;
   - grooming at 04:00 on groomed runs, skier traffic 09:00–16:00 by difficulty;
   - snow depth starts from the model's snow depth, adjusted for elevation, then accumulates and melts.
4. The state is classified into a surface (deep powder, corduroy, corn, crust, ice…) and scored 0–100.

## Next steps

- Verification: log forecasts and score them against SNOTEL, resort snow reports and user reports, then tune the coefficients.
- Precompute resorts in the GitHub Actions feed so pages load instantly and stay within API limits.
- Higher-resolution models where available (HRRR, AROME, ICON-D2) and a proper energy-balance snowpack.
