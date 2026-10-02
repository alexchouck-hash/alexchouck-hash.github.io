# Gulf & Caribbean Resort Forecast data feed

Static JSON for 440+ resorts across the Gulf of Mexico, the Caribbean and Caribbean Central America. Rebuilt every 6 hours by `.github/workflows/data.yml` and published as a single commit on the `data-feed` branch (it is force-pushed each run, so the feed never grows the repo's history). No API key.

Base URL: `https://raw.githubusercontent.com/alexchouck-hash/alexchouck-hash.github.io/data-feed/`

- `index.json`: every resort with today's headline numbers and 16-day temperature/wind arrays (`next16`, index 0 = `start`).
- `resorts/<id>.json`: one file per resort.
- `normals/<lat>_<lon>.json`: 6-year ERA5 climate normals per 0.5° cell, shared by nearby resorts.

## Resort file

| Field | Meaning |
| --- | --- |
| `meta` | Build time, units (°F, ft, in, mph), sources, `climateSource` (location normals or regional table) |
| `resort` | Name, city, region, country, coordinates, beach facing, sargassum exposure, airports |
| `cleanup` | Offshore barriers, public cleanup, resort crews, typical clearing time |
| `safety` | Travel advisory and local hazards |
| `tourism` | Area highlights |
| `current.weather` | Live conditions (temp, feels-like, humidity, wind, gusts, cloud, UV, rain) |
| `current.marine` | Live water temperature, wave height/period/direction, swell, ocean current |
| `current.staleSince` | Set (ISO time) when a live pull failed and the previous one, under 24 h old, was reused |
| `current.alerts` | Active NWS alerts (US, Puerto Rico, USVI): rip current, beach hazards, tropical, heat |
| `days[]` | Full detail for today and the next 15 days |
| `outlook` | Days 16–365 as columns (see below) |

### `days[]` entry

- `source`: `forecast`, `climate-outlook` (6-year ERA5 normals for the location) or `regional-climate` (regional monthly table, used until location normals are built).
- `weather`: `tmaxF`, `tminF`, `precipProb`, `precipIn`, `cloud`, `uv`, `windMph`, `windDir`, `rh`, `thunderPct`, `summary`.
- `ocean`: `sstF`, `waveFt`, `periodS`, `swellFt`.
- `sargassum`: `score` 0–100, `label`, `seasonal`, `beachAfterCleanup`, `confidence`.
- `crowds`: `resort`, `airport`, `city` each with `score` and `label`; `drivers` (holidays/events).
- `safety`: `ripCurrent`, `uv`, `heatIndexF`, `tropical.pct`, `actions`.
- `holidays`: holidays and events affecting that date.

### `outlook`

`start` is the first date; every other key is an array with one value per day from `start`: `source`, `sargassum` (score), `tmaxF`, `tminF`, `precipProb`, `cloud`, `uv`, `sstF`, `waveFt`, `crowdResort`, `crowdAirport`, `crowdCity`, `tropicalPct`. `holidays` maps dates to holiday names.

Sargassum levels: <10 very low, <25 low, <45 moderate, <70 high, otherwise very high. Crowd levels: <25 quiet, <45 moderate, <65 busy, <82 very busy, otherwise packed.

Models live in `js/model.js` and are shared by the website and this feed. Resort coordinates are approximate (compiled without live geocoding).
