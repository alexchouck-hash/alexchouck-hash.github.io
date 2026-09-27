// Famous waterfalls. `regime` sets how much recent rain matters; `months` is the
// typical flow by month (0–100, Jan..Dec), approximate from park and guide info.
const M = {
  east:     [70, 75, 85, 85, 70, 55, 40, 35, 35, 40, 55, 65], // eastern US rain-fed: low late summer/fall
  pnw:      [85, 85, 85, 85, 80, 60, 35, 25, 30, 55, 85, 90], // Pacific Northwest rain + snow
  sierra:   [30, 35, 50, 80, 100, 85, 45, 15, 5, 10, 20, 25], // Sierra snowmelt: peaks May
  rockies:  [15, 15, 20, 45, 90, 100, 70, 40, 25, 20, 15, 15], // Rockies snowmelt: peaks June
  shoshone: [30, 35, 50, 80, 100, 70, 20, 10, 10, 15, 20, 25], // snowmelt, then diverted for irrigation
  steady:   [85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85], // spring-fed or regulated
  zambezi:  [60, 85, 100, 100, 90, 70, 50, 35, 20, 15, 20, 40], // Victoria Falls
  iguazu:   [70, 70, 65, 65, 70, 75, 70, 60, 65, 75, 75, 70],
  glacial:  [30, 30, 30, 40, 65, 85, 100, 95, 70, 50, 35, 30], // Iceland / Alps glacial melt
  japan:    [40, 40, 50, 60, 70, 85, 80, 70, 75, 60, 45, 40],
  tropical: [80, 75, 80, 80, 70, 65, 70, 70, 65, 70, 80, 85],
};
// regime: rain (recent rain dominates), snowmelt, steady, river (season dominates)
const W = (id, name, region, country, lat, lon, heightM, regime, months, note = "") => ({ id, name, region, country, lat, lon, heightM, regime, months: M[months], note });
export const FALLS = [
  // West
  W("yosemite", "Yosemite Falls", "California", "US", 37.7566, -119.5969, 739, "snowmelt", "sierra", "Often dry by late summer."),
  W("vernal", "Vernal & Nevada Falls", "California", "US", 37.7277, -119.5443, 181, "snowmelt", "sierra"),
  W("burney", "Burney Falls", "California", "US", 41.0120, -121.6515, 39, "steady", "steady", "Fed by springs; flows year-round."),
  W("multnomah", "Multnomah Falls", "Oregon", "US", 45.5762, -122.1158, 189, "rain", "pnw"),
  W("snoqualmie", "Snoqualmie Falls", "Washington", "US", 47.5418, -121.8377, 82, "rain", "pnw", "Partly diverted for hydropower."),
  W("palouse", "Palouse Falls", "Washington", "US", 46.6636, -118.2236, 60, "snowmelt", "rockies"),
  W("shoshone", "Shoshone Falls", "Idaho", "US", 42.5951, -114.4007, 65, "snowmelt", "shoshone", "Best in spring; irrigation takes much of the summer flow."),
  W("lower-yellowstone", "Lower Falls of the Yellowstone", "Wyoming", "US", 44.7178, -110.4960, 94, "snowmelt", "rockies"),
  W("havasu", "Havasu Falls", "Arizona", "US", 36.2552, -112.6979, 30, "steady", "steady", "Spring-fed turquoise water; flash floods after storms."),
  W("bridal-veil-co", "Bridal Veil Falls (Telluride)", "Colorado", "US", 37.9203, -107.7686, 111, "snowmelt", "rockies"),
  // East & Midwest
  W("niagara", "Niagara Falls", "New York / Ontario", "US", 43.0799, -79.0747, 51, "steady", "steady", "Flow is regulated; more water is diverted at night and outside tourist season."),
  W("kaaterskill", "Kaaterskill Falls", "New York", "US", 42.1928, -74.0639, 79, "rain", "east"),
  W("taughannock", "Taughannock Falls", "New York", "US", 42.5343, -76.6179, 65, "rain", "east"),
  W("ricketts", "Ricketts Glen Falls", "Pennsylvania", "US", 41.3378, -76.2754, 29, "rain", "east"),
  W("great-falls", "Great Falls of the Potomac", "Virginia / Maryland", "US", 38.9985, -77.2528, 23, "river", "east"),
  W("whitewater", "Whitewater Falls", "North Carolina", "US", 35.0296, -83.0161, 125, "rain", "east"),
  W("looking-glass", "Looking Glass Falls", "North Carolina", "US", 35.2966, -82.7693, 18, "rain", "east"),
  W("amicalola", "Amicalola Falls", "Georgia", "US", 34.5578, -84.2489, 222, "rain", "east"),
  W("fall-creek", "Fall Creek Falls", "Tennessee", "US", 35.6634, -85.3544, 78, "rain", "east"),
  W("cumberland", "Cumberland Falls", "Kentucky", "US", 36.8381, -84.3444, 21, "river", "east", "Moonbows on clear full-moon nights."),
  W("tahquamenon", "Tahquamenon Falls", "Michigan", "US", 46.5764, -85.2566, 15, "river", "rockies", "Tea-colored water; biggest after spring snowmelt."),
  W("minnehaha", "Minnehaha Falls", "Minnesota", "US", 44.9153, -93.2110, 16, "rain", "east", "Freezes solid in cold winters."),
  W("akaka", "ʻAkaka Falls", "Hawaii", "US", 19.8541, -155.1522, 135, "rain", "tropical"),
  // Canada & world
  W("montmorency", "Montmorency Falls", "Quebec", "CA", 46.8911, -71.1476, 83, "river", "rockies"),
  W("helmcken", "Helmcken Falls", "British Columbia", "CA", 51.9544, -120.1771, 141, "snowmelt", "rockies", "Forms a giant ice cone in winter."),
  W("gullfoss", "Gullfoss", "Iceland", "IS", 64.3271, -20.1199, 32, "river", "glacial"),
  W("skogafoss", "Skógafoss", "Iceland", "IS", 63.5321, -19.5114, 60, "river", "glacial"),
  W("rhine", "Rhine Falls", "Schaffhausen", "CH", 47.6779, 8.6155, 23, "river", "glacial"),
  W("staubbach", "Staubbach Falls", "Bernese Oberland", "CH", 46.5936, 7.9056, 297, "snowmelt", "glacial"),
  W("plitvice", "Plitvice Lakes", "Lika-Senj", "HR", 44.8654, 15.5820, 78, "rain", "east"),
  W("kegon", "Kegon Falls", "Tochigi", "JP", 36.7380, 139.4990, 97, "river", "japan"),
  W("nachi", "Nachi Falls", "Wakayama", "JP", 33.6737, 135.8878, 133, "rain", "japan"),
  W("victoria", "Victoria Falls", "Zambia / Zimbabwe", "ZM", -17.9243, 25.8572, 108, "river", "zambezi", "Upstream rains peak Feb–May; low water Oct–Nov."),
  W("iguazu", "Iguazú Falls", "Argentina / Brazil", "AR", -25.6953, -54.4367, 82, "river", "iguazu"),
];
