# Vacation Conditions

Ski & snowboard snow, fall colors, hiking bugs, theme-park and city crowds, and flight/hotel cost patterns for any destination and any date up to a year out. Every metric is scored 1–100 (100 = best) and blended into an overall favorability score per activity, with rankings and "better nearby" swaps.

Published at `https://alexchouck-hash.github.io/vacation-conditions/` (GitHub Pages, from this folder on `main`). The beach & sargassum forecast lives at the repo root; this app reuses its date, holiday and data-fetch helpers (`../js/model.js`, `../js/api.js`).

## Work on it locally

```bash
git clone https://github.com/alexchouck-hash/alexchouck-hash.github.io.git
cd alexchouck-hash.github.io
python3 -m http.server 8000        # or: npx serve .
# open http://localhost:8000/vacation-conditions/
```

Serve the **repo root** (not this folder) so the shared `../js/` imports resolve. No build step and no dependencies: plain HTML, CSS and ES modules. Commit and push as usual; GitHub Pages redeploys on push to `main`.

Validate the catalog after editing data:

```bash
node vacation-conditions/scripts/validate.mjs
```

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/vacation.css` | Page (shares `../css/style.css`) |
| `js/app.js` | UI: map, tabs, rankings, swaps, 12-month chart, downloads |
| `js/model.js` | Activity registry, per-metric scores, ski/fall/bug/crowd/cost/daylight/moon models |
| `js/api.js` | Live 16-day weather and snow from Open-Meteo |
| `js/destinations.js` | Merges `data/*.js` |
| `data/ski.js`, `data/outdoors.js`, `data/parks.js` | Destination catalogs |
| `ROADMAP.md` | Planned activities (concerts, festivals, northern lights, diving…) and metrics |

## Adding a vacation type

1. Add an entry to `ACTIVITIES` in `js/model.js` with a label, icon, metric weights and critical metrics.
2. Compute any new metric in `score()` / `buildDay()` in `js/model.js` and give it a label in `METRICS`.
3. Add destinations with that type in a `data/*.js` file (see existing files for the schema) and import it in `js/destinations.js`.
4. Optionally add a detail card in `activityCards()` in `js/app.js`.

## Data caveats

Weather is a live forecast for 16 days, then typical monthly climate. Ski seasons, foliage peaks, bug seasons, crowd patterns and price indexes are typical patterns compiled from general knowledge, not live counts or fares. Use the linked searches for real prices and check resort/park/foliage reports before you go.
