// Famous fall-color destinations. `peak` = typical (climatological) peak date as
// "MM-DD", approximate from long-running foliage reports; the model shifts it
// with this year's weather. elev in m.
const S = (id, name, region, country, lat, lon, elev, peak, trees) => ({ id, name, region, country, lat, lon, elev, peak, trees });
export const SPOTS = [
  // New England & New York
  S("stowe", "Stowe & Smugglers' Notch", "Vermont", "US", 44.47, -72.69, 400, "10-03", "Sugar maple, birch"),
  S("woodstock-vt", "Woodstock", "Vermont", "US", 43.62, -72.52, 215, "10-10", "Sugar maple, red maple"),
  S("kancamagus", "Kancamagus Highway", "New Hampshire", "US", 44.02, -71.45, 600, "10-04", "Maple, birch, beech"),
  S("franconia", "Franconia Notch", "New Hampshire", "US", 44.14, -71.68, 600, "10-03", "Maple, birch"),
  S("acadia", "Acadia National Park", "Maine", "US", 44.34, -68.27, 100, "10-14", "Maple, birch, oak"),
  S("rangeley", "Rangeley Lakes", "Maine", "US", 44.97, -70.64, 480, "09-30", "Maple, birch, aspen"),
  S("berkshires", "The Berkshires", "Massachusetts", "US", 42.45, -73.25, 400, "10-10", "Maple, oak, birch"),
  S("litchfield", "Litchfield Hills", "Connecticut", "US", 41.75, -73.19, 300, "10-17", "Maple, oak, hickory"),
  S("lake-placid", "Lake Placid & High Peaks", "New York", "US", 44.28, -73.98, 570, "09-30", "Maple, birch, beech"),
  S("catskills", "Catskills", "New York", "US", 42.2, -74.2, 500, "10-12", "Maple, oak, beech"),
  S("hudson-valley", "Hudson Valley", "New York", "US", 41.7, -73.95, 100, "10-22", "Oak, maple, hickory"),
  S("letchworth", "Letchworth State Park", "New York", "US", 42.6, -78.03, 300, "10-15", "Maple, oak"),
  // Mid-Atlantic & Appalachians
  S("poconos", "Poconos", "Pennsylvania", "US", 41.05, -75.3, 450, "10-12", "Maple, oak, birch"),
  S("shenandoah", "Shenandoah & Skyline Drive", "Virginia", "US", 38.53, -78.44, 900, "10-18", "Oak, hickory, maple"),
  S("blue-ridge", "Blue Ridge Parkway (Asheville)", "North Carolina", "US", 35.6, -82.4, 1200, "10-18", "Maple, oak, sourwood"),
  S("smokies", "Great Smoky Mountains", "Tennessee", "US", 35.65, -83.5, 900, "10-27", "Maple, hickory, oak"),
  S("new-river", "New River Gorge", "West Virginia", "US", 38.07, -81.08, 500, "10-18", "Oak, maple, sassafras"),
  S("dolly-sods", "Dolly Sods & Canaan Valley", "West Virginia", "US", 39.03, -79.33, 1100, "10-05", "Maple, birch, blueberry"),
  // Midwest & South
  S("porcupine", "Porcupine Mountains", "Michigan", "US", 46.78, -89.7, 350, "09-30", "Maple, birch, oak"),
  S("traverse", "Leelanau & Traverse City", "Michigan", "US", 44.9, -85.8, 250, "10-12", "Maple, birch, oak"),
  S("door-county", "Door County", "Wisconsin", "US", 45.05, -87.15, 200, "10-10", "Maple, birch, aspen"),
  S("north-shore", "North Shore, Lake Superior", "Minnesota", "US", 47.5, -91.2, 350, "09-28", "Maple, birch, aspen"),
  S("hocking", "Hocking Hills", "Ohio", "US", 39.43, -82.54, 280, "10-20", "Maple, oak, hickory"),
  S("brown-county", "Brown County", "Indiana", "US", 39.2, -86.25, 250, "10-20", "Maple, oak, sassafras"),
  S("ozarks", "Buffalo National River (Ozarks)", "Arkansas", "US", 36.05, -93.1, 300, "10-28", "Oak, hickory, maple"),
  // West
  S("maroon-bells", "Maroon Bells", "Colorado", "US", 39.1, -106.94, 2900, "09-22", "Aspen"),
  S("kebler", "Kebler Pass", "Colorado", "US", 38.85, -107.1, 2900, "09-22", "Aspen"),
  S("telluride", "Telluride & Last Dollar Road", "Colorado", "US", 37.94, -107.9, 2800, "09-25", "Aspen"),
  S("jackson", "Grand Teton & Jackson", "Wyoming", "US", 43.75, -110.7, 2000, "09-25", "Aspen, cottonwood"),
  S("taos", "Enchanted Circle (Taos)", "New Mexico", "US", 36.6, -105.4, 2600, "09-30", "Aspen"),
  S("zion", "Zion National Park", "Utah", "US", 37.25, -112.95, 1300, "11-01", "Cottonwood, maple"),
  S("columbia-gorge", "Columbia River Gorge", "Oregon", "US", 45.6, -122.0, 100, "10-20", "Bigleaf maple, cottonwood"),
  // Canada
  S("laurentians", "Mont-Tremblant (Laurentians)", "Quebec", "CA", 46.2, -74.58, 350, "10-01", "Sugar maple, birch"),
  S("algonquin", "Algonquin Park", "Ontario", "CA", 45.55, -78.4, 450, "09-28", "Sugar maple, birch"),
  S("cabot-trail", "Cabot Trail", "Nova Scotia", "CA", 46.75, -60.65, 300, "10-10", "Maple, birch"),
  // Asia & Europe
  S("nikko", "Nikko (Irohazaka)", "Tochigi", "JP", 36.74, 139.5, 1000, "10-25", "Japanese maple, beech"),
  S("kyoto", "Kyoto", "Kyoto", "JP", 35.01, 135.77, 60, "11-25", "Japanese maple, ginkgo"),
  S("daisetsuzan", "Daisetsuzan", "Hokkaido", "JP", 43.66, 142.85, 1300, "09-22", "Rowan, birch, maple"),
  S("seoraksan", "Seoraksan", "Gangwon", "KR", 38.12, 128.47, 700, "10-18", "Maple, oak"),
  S("black-forest", "Black Forest", "Baden-Württemberg", "DE", 48.0, 8.2, 700, "10-20", "Beech, larch, maple"),
];
