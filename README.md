# Gulf & Caribbean Resort Forecast

Static site (GitHub Pages) with sargassum, weather, water temperature, waves, UV, crowd, safety and tourism forecasts for 440+ resorts across the Gulf of Mexico, the Caribbean (east to Barbados) and Caribbean Central America (south to Panama and Colombia), up to 365 days out.

- `ski-conditions/`: run-by-run snow forecast for 140+ major ski resorts worldwide (see `ski-conditions/README.md`).
- `beach-widget.html`: embeddable beach conditions widget (`?id=<resort>` or `?lat=&lon=&name=`), built from the data feed. Builder at `bluebird/widgets/`.
- `index.html`, `css/`, `js/app.js`: map + per-resort dashboard (live data fetched in the browser).
- `js/resorts.js` + `js/data/*.js`: resorts, regions (climate, crowds, cleanup, safety, tourism) and airports.
- `js/model.js`: sargassum, crowd, rip-current, heat, UV and tropical models plus climate normals.
- `js/api.js`: Open-Meteo (forecast, marine, ERA5 archive), NWS alerts and feed clients.
- `scripts/build-data.mjs` + `.github/workflows/data.yml`: JSON data feed, rebuilt every 6 hours and published on the `data-feed` branch. See `data/README.md`.
- `scripts/validate-data.mjs`: catalog sanity checks (`node scripts/validate-data.mjs`).

Days 0–15 use real forecasts; beyond that, weather and water values are 6-year climate normals for the location (regional monthly tables until those are built). Sargassum and crowd levels are modeled. Resort coordinates are approximate.
