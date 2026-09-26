# Gulf Resort Forecast

Static site (GitHub Pages) with sargassum, weather, water temperature, waves, UV, crowd, safety and tourism forecasts for 36 major Gulf of Mexico resorts, up to 365 days out.

- `index.html`, `css/`, `js/app.js`: map + per-resort dashboard (live data fetched in the browser).
- `js/resorts.js`: resorts, regions, airports, barrier/cleanup programs, safety and tourism info.
- `js/model.js`: sargassum, crowd, rip-current, heat, UV and tropical models plus climate normals.
- `js/api.js`: Open-Meteo (forecast, marine, ERA5 archive) and NWS alerts clients.
- `scripts/build-data.mjs` + `.github/workflows/data.yml`: JSON data feed in `data/`, refreshed every 3 hours. See `data/README.md`.

Days 0–15 use real forecasts; beyond that, weather and water values are 10-year climate normals for the date. Sargassum and crowd levels are modeled.
