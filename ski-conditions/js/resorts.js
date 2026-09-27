// Major ski resorts worldwide. Coordinates point at the heart of the lift network.
// Elevations (m) are approximate lift-served base / summit; treeline is where
// wind starts to move snow freely. r = search radius (km) for OpenStreetMap runs.
// Southern Hemisphere resorts are included because their season runs Jun-Oct.
const R = (id, name, country, region, lat, lon, base, summit, treeline, r = 4) => ({ id, name, country, region, lat, lon, base, summit, treeline, r });

export const RESORTS = [
  // North America: Rockies
  R("vail", "Vail", "US", "Colorado", 39.6061, -106.355, 2476, 3527, 3500, 5),
  R("aspen-snowmass", "Aspen Snowmass", "US", "Colorado", 39.2084, -106.949, 2473, 3813, 3500, 4),
  R("breckenridge", "Breckenridge", "US", "Colorado", 39.4817, -106.0384, 2926, 3914, 3500, 4),
  R("telluride", "Telluride", "US", "Colorado", 37.9375, -107.8123, 2659, 3831, 3550, 4),
  R("steamboat", "Steamboat", "US", "Colorado", 40.4572, -106.8045, 2103, 3221, 3300, 4),
  R("jackson-hole", "Jackson Hole", "US", "Wyoming", 43.5875, -110.8279, 1924, 3185, 2900, 4),
  R("big-sky", "Big Sky", "US", "Montana", 45.2857, -111.4012, 2072, 3403, 2900, 5),
  R("park-city", "Park City", "US", "Utah", 40.6514, -111.508, 2080, 3049, 3200, 5),
  R("alta", "Alta", "US", "Utah", 40.5884, -111.6386, 2600, 3216, 3300, 2),
  R("snowbird", "Snowbird", "US", "Utah", 40.583, -111.6508, 2365, 3353, 3300, 2.5),
  R("sun-valley", "Sun Valley", "US", "Idaho", 43.66, -114.406, 1752, 2789, 2800, 3),
  R("taos", "Taos Ski Valley", "US", "New Mexico", 36.596, -105.4545, 2805, 3804, 3500, 3),
  // North America: West Coast
  R("palisades-tahoe", "Palisades Tahoe", "US", "California", 39.197, -120.2357, 1890, 2750, 2700, 4),
  R("mammoth", "Mammoth Mountain", "US", "California", 37.6308, -119.0326, 2424, 3369, 3000, 4),
  R("crystal-mountain", "Crystal Mountain", "US", "Washington", 46.9282, -121.5045, 1341, 2134, 1900, 3),
  R("mt-bachelor", "Mt. Bachelor", "US", "Oregon", 43.9792, -121.6886, 1738, 2763, 2400, 4),
  // North America: Canada
  R("whistler", "Whistler Blackcomb", "CA", "British Columbia", 50.085, -122.925, 675, 2284, 1800, 6),
  R("revelstoke", "Revelstoke", "CA", "British Columbia", 50.958, -118.1633, 512, 2225, 1900, 4),
  R("banff-sunshine", "Banff Sunshine", "CA", "Alberta", 51.08, -115.77, 1660, 2730, 2300, 3),
  R("lake-louise", "Lake Louise", "CA", "Alberta", 51.4254, -116.1773, 1646, 2637, 2300, 4),
  R("tremblant", "Mont Tremblant", "CA", "Quebec", 46.2094, -74.585, 265, 875, 1500, 3),
  // North America: East
  R("stowe", "Stowe", "US", "Vermont", 44.5303, -72.7814, 390, 1339, 1200, 3),
  R("killington", "Killington", "US", "Vermont", 43.6045, -72.8201, 355, 1293, 1200, 4),
  // Europe: France
  R("chamonix", "Chamonix (Grands Montets)", "FR", "Alps", 45.957, 6.992, 1235, 3275, 2100, 4),
  R("val-disere", "Val d'Isère", "FR", "Alps", 45.4481, 6.9806, 1850, 3456, 2100, 4),
  R("tignes", "Tignes", "FR", "Alps", 45.4683, 6.9056, 1550, 3456, 2100, 4),
  R("courchevel", "Courchevel", "FR", "Alps", 45.4154, 6.6347, 1260, 2738, 2100, 4),
  R("val-thorens", "Val Thorens", "FR", "Alps", 45.298, 6.58, 1800, 3230, 2000, 4),
  R("les-arcs", "Les Arcs", "FR", "Alps", 45.5725, 6.829, 1200, 3226, 2100, 5),
  R("alpe-dhuez", "Alpe d'Huez", "FR", "Alps", 45.092, 6.069, 1250, 3330, 2100, 5),
  R("la-grave", "La Grave", "FR", "Alps", 45.045, 6.306, 1450, 3550, 2000, 3),
  // Europe: Switzerland
  R("zermatt", "Zermatt", "CH", "Alps", 46.0, 7.73, 1620, 3883, 2200, 5),
  R("verbier", "Verbier", "CH", "Alps", 46.0961, 7.2286, 1500, 3330, 2200, 4),
  R("st-moritz", "St. Moritz", "CH", "Alps", 46.498, 9.839, 1720, 3303, 2200, 5),
  R("davos", "Davos Klosters", "CH", "Alps", 46.8027, 9.836, 1124, 2844, 2100, 5),
  R("laax", "Laax", "CH", "Alps", 46.839, 9.258, 1100, 3018, 2100, 5),
  // Europe: Austria
  R("st-anton", "St. Anton", "AT", "Alps", 47.1297, 10.2683, 1304, 2811, 2000, 4),
  R("lech-zurs", "Lech Zürs", "AT", "Alps", 47.208, 10.142, 1450, 2811, 1900, 4),
  R("ischgl", "Ischgl", "AT", "Alps", 46.969, 10.289, 1400, 2872, 2000, 5),
  R("solden", "Sölden", "AT", "Alps", 46.965, 11.007, 1350, 3340, 2000, 5),
  R("kitzbuhel", "Kitzbühel", "AT", "Alps", 47.446, 12.392, 800, 2000, 1800, 5),
  // Europe: Italy, Spain, Nordics, Caucasus
  R("cortina", "Cortina d'Ampezzo", "IT", "Dolomites", 46.5405, 12.1357, 1224, 2939, 2100, 6),
  R("val-gardena", "Val Gardena", "IT", "Dolomites", 46.558, 11.76, 1236, 2518, 2100, 5),
  R("cervinia", "Cervinia", "IT", "Alps", 45.934, 7.63, 1524, 3480, 2200, 4),
  R("baqueira", "Baqueira-Beret", "ES", "Pyrenees", 42.7, 0.934, 1500, 2610, 2200, 5),
  R("are", "Åre", "SE", "Scandinavia", 63.399, 13.081, 380, 1274, 800, 5),
  R("gudauri", "Gudauri", "GE", "Caucasus", 42.477, 44.478, 1990, 3279, 2300, 4),
  // Asia
  R("niseko", "Niseko United", "JP", "Hokkaido", 42.8625, 140.6987, 255, 1308, 1000, 4),
  R("rusutsu", "Rusutsu", "JP", "Hokkaido", 42.748, 140.558, 400, 994, 1100, 3),
  R("hakuba-happo", "Hakuba Happo-one", "JP", "Nagano", 36.698, 137.832, 760, 1831, 1600, 3),
  R("nozawa-onsen", "Nozawa Onsen", "JP", "Nagano", 36.922, 138.446, 565, 1650, 1600, 3),
  R("yongpyong", "Yongpyong", "KR", "Gangwon", 37.644, 128.68, 700, 1458, 1500, 3),
  R("gulmarg", "Gulmarg", "IN", "Kashmir", 34.0484, 74.3805, 2650, 3980, 3200, 4),
  // Southern Hemisphere
  R("portillo", "Portillo", "CL", "Andes", -32.835, -70.13, 2590, 3310, 2000, 3),
  R("valle-nevado", "Valle Nevado", "CL", "Andes", -33.357, -70.249, 2860, 3670, 2000, 4),
  R("las-lenas", "Las Leñas", "AR", "Andes", -35.15, -70.083, 2240, 3430, 2000, 4),
  R("cerro-catedral", "Cerro Catedral", "AR", "Patagonia", -41.169, -71.439, 1030, 2100, 1600, 4),
  R("thredbo", "Thredbo", "AU", "Snowy Mountains", -36.505, 148.306, 1365, 2037, 1850, 3),
  R("perisher", "Perisher", "AU", "Snowy Mountains", -36.406, 148.411, 1605, 2054, 1850, 5),
  R("remarkables", "The Remarkables", "NZ", "Otago", -45.054, 168.813, 1580, 1956, 1200, 2.5),
  R("coronet-peak", "Coronet Peak", "NZ", "Otago", -45.081, 168.729, 1168, 1649, 1100, 2.5),
  R("mt-hutt", "Mt Hutt", "NZ", "Canterbury", -43.472, 171.53, 1400, 2086, 1200, 2.5),
];
