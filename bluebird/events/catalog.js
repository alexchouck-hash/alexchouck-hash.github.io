// Major recurring events near ski towns and beach destinations. Dates come from
// rules because they move every year; they are APPROXIMATE, so the page always
// says "confirm with the organizer". impact: 1 local, 2 regional draw, 3 sells out towns.
// rule: { fixed: ["MM-DD", days] } | { nth: [month1to12, weekday0Sun, n(-1 = last)], days, offset? } | { easter: offsetDays, days }
const E = (id, name, town, country, lat, lon, category, impact, rule, note = "") => ({ id, name, town, country, lat, lon, category, impact, rule, note });
export const EVENTS = [
  // Ski towns
  E("x-games-aspen", "X Games Aspen", "Aspen, CO", "US", 39.21, -106.95, "sport", 3, { nth: [1, 4, 4], days: 4 }, "Held late January in recent years; format and dates change."),
  E("ullr-fest", "Ullr Fest", "Breckenridge, CO", "US", 39.48, -106.04, "festival", 2, { nth: [1, 3, 2], days: 4 }),
  E("steamboat-carnival", "Winter Carnival", "Steamboat Springs, CO", "US", 40.48, -106.83, "festival", 2, { nth: [2, 3, 2], days: 5 }),
  E("food-wine-aspen", "Food & Wine Classic", "Aspen, CO", "US", 39.19, -106.82, "food", 3, { nth: [6, 5, 3], days: 3 }),
  E("telluride-bluegrass", "Telluride Bluegrass Festival", "Telluride, CO", "US", 37.94, -107.81, "music", 3, { nth: [6, 4, 3], days: 4 }),
  E("telluride-film", "Telluride Film Festival", "Telluride, CO", "US", 37.94, -107.81, "film", 3, { nth: [9, 1, 1], days: 4, offset: -3 }, "Labor Day weekend."),
  E("jackson-hill-climb", "Pole-Pedal-Paddle & spring events", "Jackson, WY", "US", 43.48, -110.76, "sport", 1, { nth: [4, 6, 1], days: 1 }),
  E("quebec-carnival", "Québec Winter Carnival", "Québec City, QC", "CA", 46.81, -71.21, "festival", 3, { nth: [2, 5, 1], days: 17, offset: -7 }),
  E("hahnenkamm", "Hahnenkamm World Cup races", "Kitzbühel", "AT", 47.45, 12.39, "ski-race", 3, { nth: [1, 5, 3], days: 3 }),
  E("lauberhorn", "Lauberhorn World Cup races", "Wengen", "CH", 46.61, 7.92, "ski-race", 3, { nth: [1, 5, 2], days: 3 }),
  E("snowbombing", "Snowbombing", "Mayrhofen", "AT", 47.17, 11.86, "music", 3, { nth: [4, 1, 1], days: 6 }, "Early April in recent years."),
  E("tomorrowland-winter", "Tomorrowland Winter", "Alpe d'Huez", "FR", 45.09, 6.07, "music", 3, { nth: [3, 6, 3], days: 7 }, "Mid/late March in recent years."),
  E("nozawa-fire", "Dōsojin Fire Festival", "Nozawa Onsen", "JP", 36.92, 138.44, "cultural", 2, { fixed: ["01-15", 1] }),
  E("sapporo-snow", "Sapporo Snow Festival", "Sapporo", "JP", 43.06, 141.35, "festival", 3, { nth: [2, 2, 1], days: 7 }, "Early February; 1–2 hours from Niseko, Rusutsu and Kiroro."),
  E("queenstown-winter", "Queenstown Winter Festival", "Queenstown", "NZ", -45.03, 168.66, "festival", 2, { nth: [6, 4, -1], days: 4 }),
  E("whistler-pride", "Whistler Pride & Ski Festival", "Whistler, BC", "CA", 50.12, -122.95, "festival", 2, { nth: [1, 0, -1], days: 8, offset: -7 }),
  E("vasaloppet", "Vasaloppet", "Sälen–Mora", "SE", 61.0, 13.9, "sport", 2, { nth: [3, 0, 1], days: 1 }),
  // Gulf & Caribbean
  E("mardi-gras-nola", "Mardi Gras parades", "New Orleans, LA", "US", 29.95, -90.07, "festival", 3, { easter: -59, days: 13 }),
  E("mardi-gras-mobile", "Mardi Gras", "Mobile, AL", "US", 30.69, -88.04, "festival", 2, { easter: -59, days: 13 }),
  E("jazz-fest", "New Orleans Jazz & Heritage Festival", "New Orleans, LA", "US", 29.98, -90.08, "music", 3, { nth: [4, 5, -1], days: 10 }, "Last weekend of April into the first of May."),
  E("fantasy-fest", "Fantasy Fest", "Key West, FL", "US", 24.55, -81.78, "festival", 3, { nth: [10, 0, -1], days: 10, offset: -9 }),
  E("spring-break-spi", "Spring Break", "South Padre Island, TX", "US", 26.11, -97.17, "festival", 2, { fixed: ["03-01", 31] }),
  E("trinidad-carnival", "Carnival Monday & Tuesday", "Port of Spain", "TT", 10.66, -61.51, "festival", 3, { easter: -48, days: 2 }),
  E("cozumel-carnaval", "Carnaval", "Cozumel", "MX", 20.51, -86.95, "festival", 2, { easter: -52, days: 6 }),
  E("veracruz-carnaval", "Carnaval de Veracruz", "Veracruz", "MX", 19.18, -96.13, "festival", 3, { easter: -54, days: 8 }),
  E("crop-over", "Crop Over (Grand Kadooment)", "Bridgetown", "BB", 13.1, -59.61, "festival", 3, { nth: [8, 1, 1], days: 8, offset: -7 }),
  E("junkanoo", "Junkanoo parades", "Nassau", "BS", 25.06, -77.35, "cultural", 2, { fixed: ["12-26", 1] }),
  E("junkanoo-ny", "Junkanoo New Year's parade", "Nassau", "BS", 25.06, -77.35, "cultural", 2, { fixed: ["01-01", 1] }),
  E("reggae-sumfest", "Reggae Sumfest", "Montego Bay", "JM", 18.47, -77.92, "music", 3, { nth: [7, 0, 3], days: 7, offset: -6 }),
  E("antigua-sailing", "Antigua Sailing Week", "English Harbour", "AG", 17.0, -61.76, "sport", 2, { nth: [4, 6, -1], days: 7 }),
  E("heineken-regatta", "Heineken Regatta", "St. Maarten", "SX", 18.03, -63.08, "sport", 2, { nth: [3, 4, 1], days: 4 }),
  E("sanse", "San Sebastián Street Festival", "San Juan", "PR", 18.47, -66.12, "festival", 2, { nth: [1, 4, 3], days: 4 }),
];
