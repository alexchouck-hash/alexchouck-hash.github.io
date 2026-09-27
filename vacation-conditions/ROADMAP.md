# Vacation Conditions roadmap

Goal: one place to check **every condition that makes a trip good or bad**, for any destination and any date up to a year out, scored 1–100 per metric and overall.

The app is built around an **activity registry** (`js/model.js` → `ACTIVITIES`). Each activity lists the metrics it cares about and their weights. Adding a vacation type = a data file in `data/`, one registry entry, and any new metric functions. Everything else (map, rankings, swaps, 12-month chart, costs, downloads) works automatically.

## Status

| Activity | Status |
| --- | --- |
| ⛷️ Skiing & snowboarding | **Live**: season, typical base, forecast snowfall, ski temps, crowds, costs |
| 🍁 Fall colors | **Live**: typical peak timing, color index, weather, crowds, costs |
| 🥾 Hiking & national parks | **Live**: temperature, rain, bugs (mosquito, black fly, tick, biting fly), trail snow, crowds, costs |
| 🎢 Theme parks & cities | **Live**: crowd level 1–10 with holidays/events/day of week, heat, rain, costs |
| 🌌 Northern lights | **Live**: NOAA SWPC 3-day/27-day Kp outlook, Kp needed per site, clouds, darkness, moon (23 sites) |
| 🔭 Stargazing & dark skies | **Live**: moonlight, clouds, Bortle class (23 sites) |
| 🏖️ Beaches & sargassum | **Live** as the sister site (`../`); to be merged in as an activity |

## Cross-cutting metrics (every destination)

| Metric | Status | Source |
| --- | --- | --- |
| Weather (temp, rain, snow, wind, clouds) | Live 16 days, then typical | Open-Meteo |
| Crowds | Modeled | Seasonality, US holidays, events, day of week |
| Flight & hotel cost | Modeled index | Seasonality, holidays, events, day of week. Next: live fares via Amadeus / Travelpayouts API key |
| Daylight hours, moon phase | Live (calculated) | Astronomy |
| UV, heat index | Live 16 days | Open-Meteo |
| Air quality & wildfire smoke | **Live** (5 days) | Open-Meteo Air Quality (US AQI, PM2.5) |
| Pollen / allergies | Planned | Open-Meteo Air Quality (Europe) / Pollen APIs |
| Severe weather alerts | **Live** (US) | NWS alerts; hurricanes (NHC) planned |
| Travel advisories & safety | **Static levels** (verify) | US State Dept; live feed planned |
| Road/park closures, timed-entry permits | Planned | NPS API (free key) |
| Currency / exchange rate | Planned | Frankfurter (ECB rates, free) |
| Time zone & jet lag | Planned | Calculated from home airport |
| Drive time from home | Planned | OSRM (free) |
| Local holidays & school breaks (international) | Planned | Nager.Date (free) |

## More reasons to go on vacation (and the metrics each needs)

| Activity | Key metrics | Data sources |
| --- | --- | --- |
| 🎵 Concerts & music festivals | Event dates, lineup, ticket price trend, hotel surge, weather, crowd | Ticketmaster Discovery / SeatGeek / Songkick APIs (free keys) |
| 🏈 Sports events (games, F1, Masters, marathons) | Schedules, ticket prices, hotel surge | League APIs, SeatGeek, TheSportsDB |
| 🎭 Festivals & holidays (Mardi Gras, Oktoberfest, Carnival, Día de Muertos, Christmas markets) | Dates, crowds, hotel surge | Curated calendar + Nager.Date |
| 🌸 Cherry blossoms & wildflower superblooms | Bloom forecast / peak window, weather | Japan Meteorological Corp forecasts, NPS bloom reports, rainfall-driven models |
| 🌌 Northern lights | Kp forecast, cloud cover, darkness, moon | NOAA SWPC (27-day Kp outlook), Open-Meteo clouds |
| 🔭 Stargazing & eclipses | Moon phase, clouds, light pollution, eclipse paths | Astronomy calc, Open-Meteo, NASA eclipse data |
| 🤿 Scuba & snorkeling | Water temp, visibility, waves, currents, marine life seasons | Open-Meteo Marine, curated visibility seasons |
| 🏄 Surfing & kiteboarding | Swell height/period/direction, wind, tides | Open-Meteo Marine, NOAA tides |
| 🐋 Wildlife (whale watching, migrations, safari, bird migrations) | Seasonal sighting odds | Curated seasons, eBird API |
| 🎣 Fishing | Seasons, water temp, tides, moon, regulations | Curated seasons, NOAA tides |
| ⛳ Golf | Temperature, rain, wind, course conditions, peak/off-peak rates | Open-Meteo + curated seasons |
| 🚤 Lakes, boating & rafting | Water level/flow, water temp, algae advisories | USGS Water Services (free) |
| 🍷 Wine & food (harvest, crush, food festivals) | Harvest windows, events | Curated calendar |
| 🚢 Cruises | Sea state, hurricane risk, port weather, price seasonality | Open-Meteo Marine, NHC |
| 🏕️ Camping & RV | Night lows, fire bans, bugs, campground availability | NWS fire weather, Recreation.gov API |
| 🚗 Road trips & scenic drives | Road closures, fuel prices, foliage/wildflowers, daylight | State 511 feeds, EIA fuel prices |
| 🧗 Climbing & mountaineering | Temps, precipitation, avalanche danger | Avalanche.org, Open-Meteo |
| 🚴 Cycling | Temp, wind, rain, daylight | Open-Meteo |
| 🧖 Wellness, spa & hot springs | Temp contrast, crowds | Curated |
| 🏛️ Museums & culture | Crowds, closures, free days | Curated |
| 🎄 Holiday travel (Christmas markets, lights) | Dates, crowds, cold | Curated calendar |
| 🛍️ Shopping trips | Sales seasons, tax-free days | Curated |
| 💍 Honeymoons & special occasions | Overall weather + low crowds + price | Composite |
| 👨‍👩‍👧 Family & school-break travel | School calendars, kid-friendly weather, crowds | School calendar data |
| 🏆 Bucket-list natural events (fireflies, bioluminescence, king tides) | Narrow seasonal windows, moon | Curated + astronomy |

## Next steps (suggested order)

1. ~~Air quality/smoke, severe weather alerts and travel advisories on every destination.~~ Done.
2. ~~Northern lights and stargazing.~~ Done.
3. Concerts & festivals via Ticketmaster/SeatGeek (needs a free API key stored as a repo secret, fetched by a scheduled Action).
4. Live flight/hotel prices (API key) layered over the modeled index.
5. Diving, surfing and whale watching (Open-Meteo Marine + curated seasons).
6. Merge the beach/sargassum site in as an activity so rankings cover every trip type.
7. "Where should I go?" mode: pick dates + home airport, rank all activities together.
