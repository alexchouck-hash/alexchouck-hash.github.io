# Bluebird

Forecasts for perfect days outside. A family of partner sites sharing one brand, header and design system (`assets/`).

| Site | Path | Data |
| --- | --- | --- |
| Hub | `bluebird/` | |
| Snow | `ski-conditions/` | Open-Meteo multi-model + OSM runs, SNOTEL verification |
| Beach | `/` (repo root) | Open-Meteo, marine, sargassum model |
| Foliage | `bluebird/foliage/` | Open-Meteo forecast + ERA5 archive; peak-timing model in `foliage/model.js` |
| Rivers | `bluebird/rivers/` | USGS Water Services live gauges + daily percentiles |
| Offshore | `bluebird/offshore/` | Open-Meteo marine + weather; go/no-go by boat size |
| Camp | `bluebird/camp/` | Open-Meteo hourly; night-by-night scoring |

Everything is static and key-less; data is fetched in the browser. Tests: `node bluebird/tests/test.mjs`.

The folder is self-contained (only relative links to `../ski-conditions/` and the root beach site), so it can move to its own repository. After moving, update the Snow and Beach `href`s in `assets/shared.js`.

## Brand

- Name: a *bluebird day* is the clear, sunny day after a storm.
- Logo: `assets/logo.svg`, a blue bird flying across a gold sun above the horizon.
- Colors: brand blue `#1f6feb`, sun gold `#f6b73c`; each partner site has its own accent (see `SITES` in `assets/shared.js`).
- Scores everywhere use one 0–100 scale: Bluebird (80+), Good, Fair, Poor, Stay home.
