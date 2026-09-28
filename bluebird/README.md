# Bluebird

Forecasts for perfect days outside. A family of partner sites sharing one brand, header and design system (`assets/`).

| Site | Path | Data |
| --- | --- | --- |
| Hub | `bluebird/` | |
| Snow | `ski-conditions/` | Open-Meteo multi-model + OSM runs, SNOTEL verification |
| Beach | `/` (repo root) | Open-Meteo, marine, sargassum model |
| Foliage | `bluebird/foliage/` | Open-Meteo forecast + ERA5 archive; peak-timing model in `foliage/model.js` |
| Rivers | `bluebird/rivers/` | USGS Water Services live gauges + daily percentiles |
| Waterfalls | `bluebird/waterfalls/` | Open-Meteo recent rain vs ERA5 normals + monthly flow regime per fall |
| Widgets | `bluebird/widgets/` | Builder for the snow widget (`ski-conditions/embed.html`, `?r=` or `?lat=&lon=&name=`) and beach widget (`beach-widget.html`, `?id=` or `?lat=&lon=&name=`) |
| Events | `bluebird/events/` | Curated annual events (`events/catalog.js`, rule-based dates, approximate), public holidays for any country (Nager.Date), optional live events (Ticketmaster, `scripts/build-events.mjs` + `TICKETMASTER_API_KEY` secret), daily demand score, .ics export; widget `events/embed.html?lat=&lon=&name=&cc=` |
| Offshore | `bluebird/offshore/` | Open-Meteo marine + weather; go/no-go by boat size |
| Camp | `bluebird/camp/` | Open-Meteo hourly; night-by-night scoring |

Everything is static and key-less; data is fetched in the browser. Tests: `node bluebird/tests/test.mjs`.

The folder is self-contained (only relative links to `../ski-conditions/` and the root beach site), so it can move to its own repository. After moving, update the Snow and Beach `href`s in `assets/shared.js`.

## Brand

- Name: a *bluebird day* is the clear, sunny day after a storm.
- Logo: `assets/logo.svg`, a blue bird flying across a gold sun above the horizon.
- Colors: brand blue `#1f6feb`, sun gold `#f6b73c`; each partner site has its own accent (see `SITES` in `assets/shared.js`).
- Scores everywhere use one 0–100 scale: Bluebird (80+), Good, Fair, Poor, Stay home.

## Live events (optional)

Add a free Ticketmaster Discovery API key as the repository secret `TICKETMASTER_API_KEY` (Settings → Secrets and variables → Actions). The data workflow then publishes `events/live.json` on the `data-feed` branch every 6 hours (events within 60 km of every ski resort and curated event town, next 120 days), and the Events page and widget include them. Without the key, the site uses curated events and public holidays only.
