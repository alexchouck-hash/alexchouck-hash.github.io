# Gulf Resort Forecast data feed

Static JSON, rebuilt every 3 hours by `.github/workflows/data.yml`. No API key.

- `data/index.json`: every resort with today's headline numbers and a link to its file.
- `data/resorts/<id>.json`: one file per resort.

## Resort file

| Field | Meaning |
| --- | --- |
| `meta` | Build time, units (°F, ft, in, mph), sources |
| `resort` | Name, city, coordinates, beach facing, sargassum exposure, airports |
| `cleanup` | Offshore barriers, public cleanup, resort crews, typical clearing time |
| `tourism` | Area highlights |
| `current.weather` | Live conditions (temp, feels-like, humidity, wind, gusts, cloud, UV, rain) |
| `current.marine` | Live water temperature, wave height/period/direction, swell, ocean current |
| `current.staleSince` | Set (ISO time) when a live pull failed and the previous one, under 24 h old, was reused |
| `current.alerts` | Active NWS alerts (US resorts): rip current, beach hazards, tropical, heat |
| `days[]` | 366 entries, today through one year out |

### `days[]` entry

- `source`: `forecast` (days 0–15, marine days 0–7) or `climate-outlook` (10-year ERA5 normals for the date).
- `weather`: `tmaxF`, `tminF`, `precipProb`, `precipIn`, `cloud`, `uv`, `windMph`, `windDir`, `rh`, `thunderPct`, `summary`.
- `ocean`: `sstF`, `waveFt`, `periodS`, `swellFt`.
- `sargassum`: `score` 0–100, `label`, `seasonal`, `beachAfterCleanup`, `confidence`, `cleanup`.
- `crowds`: `resort`, `airport`, `city` each with `score` and `label`; `drivers` (holidays/events).
- `safety`: `ripCurrent`, `uv`, `heatIndexF`, `tropical.pct`, `travelAdvisory`, `local`, `actions`.
- `holidays`: US/Mexico holidays and events affecting that date.

Models live in `js/model.js` and are shared by the website and this feed.
