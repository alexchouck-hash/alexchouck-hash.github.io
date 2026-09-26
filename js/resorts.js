// Major resorts around the Gulf of Mexico (plus its Yucatán / Straits edges).
// facing: compass bearing (deg) the beach faces toward open water. Onshore wind
//   blows FROM roughly this direction and pushes sargassum onto the beach.
// exposure: 0..1 relative susceptibility to sargassum landings (geography,
//   proximity to the Caribbean / Loop Current inflow, barrier-island shelter).
// basin: which seasonal sargassum curve applies.
// region: crowd / climate / safety profile key (see model.js).

export const REGIONS = {
  fl_sw: { name: "Southwest Florida", country: "US", tz: "America/New_York", sst: [22, 21, 23, 25, 28, 30, 31, 31, 30, 28, 25, 23] },
  fl_tb: { name: "Tampa Bay Beaches", country: "US", tz: "America/New_York", sst: [19, 19, 21, 24, 27, 29, 30, 30, 29, 27, 23, 20] },
  fl_ph: { name: "Florida Panhandle", country: "US", tz: "America/Chicago", sst: [16, 16, 18, 22, 26, 29, 30, 30, 29, 25, 21, 18] },
  al_ms: { name: "Alabama & Mississippi Coast", country: "US", tz: "America/Chicago", sst: [14, 15, 18, 22, 26, 29, 30, 30, 29, 25, 20, 16] },
  la: { name: "Louisiana Coast", country: "US", tz: "America/Chicago", sst: [15, 16, 19, 23, 27, 29, 30, 30, 29, 25, 20, 17] },
  tx_up: { name: "Upper Texas Coast", country: "US", tz: "America/Chicago", sst: [15, 16, 19, 23, 27, 29, 30, 30, 29, 26, 21, 17] },
  tx_lo: { name: "Coastal Bend & South Texas", country: "US", tz: "America/Chicago", sst: [18, 19, 21, 24, 27, 29, 30, 30, 29, 27, 23, 20] },
  fl_keys: { name: "Florida Keys", country: "US", tz: "America/New_York", sst: [23, 23, 25, 27, 29, 30, 31, 31, 30, 29, 26, 24] },
  mx_cun: { name: "Cancún & Isla Mujeres", country: "MX", tz: "America/Cancun", sst: [26, 26, 26, 27, 28, 29, 29, 30, 30, 29, 28, 27] },
  mx_rm: { name: "Riviera Maya", country: "MX", tz: "America/Cancun", sst: [26, 26, 27, 27, 28, 29, 29, 30, 30, 29, 28, 27] },
  mx_yuc: { name: "Yucatán & Campeche Gulf Coast", country: "MX", tz: "America/Merida", sst: [24, 24, 25, 27, 28, 29, 30, 30, 30, 29, 27, 25] },
  mx_ver: { name: "Veracruz & Tamaulipas", country: "MX", tz: "America/Mexico_City", sst: [22, 22, 24, 26, 28, 29, 29, 29, 29, 28, 25, 23] },
  cu: { name: "Varadero, Cuba", country: "CU", tz: "America/Havana", sst: [25, 25, 25, 26, 27, 28, 29, 30, 29, 28, 27, 26] },
};

// Airports: code -> [name, lat, lon]
export const AIRPORTS = {
  RSW: ["Southwest Florida Intl (Fort Myers)", 26.536, -81.755],
  APF: ["Naples Airport", 26.152, -81.775],
  SRQ: ["Sarasota–Bradenton Intl", 27.395, -82.554],
  TPA: ["Tampa Intl", 27.975, -82.533],
  PIE: ["St. Pete–Clearwater Intl", 27.910, -82.687],
  VPS: ["Destin–Fort Walton Beach", 30.483, -86.525],
  ECP: ["Northwest Florida Beaches Intl", 30.358, -85.796],
  PNS: ["Pensacola Intl", 30.473, -87.187],
  GPT: ["Gulfport–Biloxi Intl", 30.407, -89.070],
  MOB: ["Mobile Intl", 30.691, -88.243],
  MSY: ["New Orleans Louis Armstrong Intl", 29.993, -90.258],
  HOU: ["Houston Hobby", 29.645, -95.279],
  IAH: ["Houston George Bush Intercontinental", 29.990, -95.336],
  CRP: ["Corpus Christi Intl", 27.770, -97.501],
  BRO: ["Brownsville South Padre Island Intl", 25.907, -97.426],
  EYW: ["Key West Intl", 24.556, -81.760],
  CUN: ["Cancún Intl", 21.036, -86.877],
  MID: ["Mérida Intl", 20.937, -89.658],
  CPE: ["Campeche Intl", 19.817, -90.500],
  VER: ["Veracruz Intl", 19.146, -96.187],
  TAM: ["Tampico Intl", 22.296, -97.866],
  VRA: ["Varadero Juan Gualberto Gómez Intl", 23.034, -81.435],
  TQO: ["Tulum Intl", 20.084, -87.590],
};

export const RESORTS = [
  // Southwest Florida
  { id: "ritz-naples", name: "The Ritz-Carlton Naples", city: "Naples, FL", region: "fl_sw", lat: 26.2130, lon: -81.8141, facing: 265, exposure: 0.30, basin: "gulf_e", airports: ["RSW", "APF"] },
  { id: "marco-marriott", name: "JW Marriott Marco Island", city: "Marco Island, FL", region: "fl_sw", lat: 25.9360, lon: -81.7290, facing: 245, exposure: 0.30, basin: "gulf_e", airports: ["RSW", "APF"] },
  { id: "south-seas", name: "South Seas Island Resort", city: "Captiva, FL", region: "fl_sw", lat: 26.5270, lon: -82.1920, facing: 270, exposure: 0.30, basin: "gulf_e", airports: ["RSW"] },
  { id: "pink-shell", name: "Pink Shell Beach Resort", city: "Fort Myers Beach, FL", region: "fl_sw", lat: 26.4520, lon: -81.9480, facing: 225, exposure: 0.28, basin: "gulf_e", airports: ["RSW"] },
  { id: "lido-beach", name: "Lido Beach Resort", city: "Sarasota, FL", region: "fl_tb", lat: 27.3140, lon: -82.5770, facing: 255, exposure: 0.27, basin: "gulf_e", airports: ["SRQ", "TPA"] },
  // Tampa Bay beaches
  { id: "don-cesar", name: "The Don CeSar", city: "St. Pete Beach, FL", region: "fl_tb", lat: 27.7110, lon: -82.7400, facing: 255, exposure: 0.25, basin: "gulf_e", airports: ["TPA", "PIE"] },
  { id: "tradewinds", name: "TradeWinds Island Grand", city: "St. Pete Beach, FL", region: "fl_tb", lat: 27.7390, lon: -82.7480, facing: 260, exposure: 0.25, basin: "gulf_e", airports: ["TPA", "PIE"] },
  { id: "opal-sands", name: "Opal Sands Resort", city: "Clearwater Beach, FL", region: "fl_tb", lat: 27.9760, lon: -82.8290, facing: 270, exposure: 0.24, basin: "gulf_e", airports: ["TPA", "PIE"] },
  // Panhandle
  { id: "hilton-pensacola", name: "Hilton Pensacola Beach", city: "Pensacola Beach, FL", region: "fl_ph", lat: 30.3290, lon: -87.1420, facing: 175, exposure: 0.40, basin: "gulf_n", airports: ["PNS"] },
  { id: "henderson", name: "Henderson Beach Resort", city: "Destin, FL", region: "fl_ph", lat: 30.3840, lon: -86.4460, facing: 180, exposure: 0.38, basin: "gulf_n", airports: ["VPS", "ECP"] },
  { id: "sandestin", name: "Sandestin Golf and Beach Resort", city: "Miramar Beach, FL", region: "fl_ph", lat: 30.3830, lon: -86.3290, facing: 180, exposure: 0.38, basin: "gulf_n", airports: ["VPS", "ECP"] },
  { id: "watercolor", name: "WaterColor Inn", city: "Santa Rosa Beach, FL", region: "fl_ph", lat: 30.3280, lon: -86.1590, facing: 190, exposure: 0.36, basin: "gulf_n", airports: ["ECP", "VPS"] },
  { id: "edgewater-pcb", name: "Edgewater Beach & Golf Resort", city: "Panama City Beach, FL", region: "fl_ph", lat: 30.1730, lon: -85.8000, facing: 200, exposure: 0.36, basin: "gulf_n", airports: ["ECP"] },
  // Alabama & Mississippi
  { id: "lodge-gsp", name: "The Lodge at Gulf State Park", city: "Gulf Shores, AL", region: "al_ms", lat: 30.2490, lon: -87.6450, facing: 180, exposure: 0.45, basin: "gulf_n", airports: ["PNS", "MOB"] },
  { id: "perdido-beach", name: "Perdido Beach Resort", city: "Orange Beach, AL", region: "al_ms", lat: 30.2800, lon: -87.5250, facing: 180, exposure: 0.45, basin: "gulf_n", airports: ["PNS", "MOB"] },
  { id: "beau-rivage", name: "Beau Rivage Resort & Casino", city: "Biloxi, MS", region: "al_ms", lat: 30.3930, lon: -88.8930, facing: 180, exposure: 0.15, basin: "gulf_n", airports: ["GPT"] },
  // Louisiana
  { id: "grand-isle", name: "Grand Isle Beach Rentals", city: "Grand Isle, LA", region: "la", lat: 29.2360, lon: -89.9870, facing: 150, exposure: 0.40, basin: "gulf_n", airports: ["MSY"] },
  // Texas
  { id: "san-luis", name: "The San Luis Resort", city: "Galveston, TX", region: "tx_up", lat: 29.2800, lon: -94.8120, facing: 140, exposure: 0.70, basin: "gulf_w", airports: ["HOU", "IAH"] },
  { id: "moody-gardens", name: "Moody Gardens Hotel", city: "Galveston, TX", region: "tx_up", lat: 29.2710, lon: -94.8530, facing: 140, exposure: 0.65, basin: "gulf_w", airports: ["HOU", "IAH"] },
  { id: "cinnamon-shore", name: "Cinnamon Shore", city: "Port Aransas, TX", region: "tx_lo", lat: 27.7750, lon: -97.1000, facing: 120, exposure: 0.72, basin: "gulf_w", airports: ["CRP"] },
  { id: "pearl-spi", name: "Pearl South Padre", city: "South Padre Island, TX", region: "tx_lo", lat: 26.0990, lon: -97.1640, facing: 95, exposure: 0.75, basin: "gulf_w", airports: ["BRO"] },
  { id: "isla-grand", name: "Isla Grand Beach Resort", city: "South Padre Island, TX", region: "tx_lo", lat: 26.1000, lon: -97.1650, facing: 95, exposure: 0.75, basin: "gulf_w", airports: ["BRO"] },
  // Florida Keys / Straits
  { id: "casa-marina", name: "Casa Marina Key West", city: "Key West, FL", region: "fl_keys", lat: 24.5470, lon: -81.7880, facing: 180, exposure: 0.60, basin: "carib", airports: ["EYW"] },
  // Mexico: Cancún / Isla Mujeres (Gulf-facing north shore + Caribbean hotel zone)
  { id: "riu-peninsula", name: "Riu Palace Peninsula", city: "Cancún, MX", region: "mx_cun", lat: 21.1380, lon: -86.7460, facing: 10, exposure: 0.55, basin: "carib", airports: ["CUN"] },
  { id: "hyatt-ziva-cun", name: "Hyatt Ziva Cancún", city: "Cancún, MX", region: "mx_cun", lat: 21.1360, lon: -86.7400, facing: 45, exposure: 0.60, basin: "carib", airports: ["CUN"] },
  { id: "fiesta-coral", name: "Grand Fiesta Americana Coral Beach", city: "Cancún, MX", region: "mx_cun", lat: 21.1300, lon: -86.7460, facing: 20, exposure: 0.55, basin: "carib", airports: ["CUN"] },
  { id: "iberostar-cun", name: "Iberostar Selection Cancún", city: "Cancún, MX", region: "mx_cun", lat: 21.0700, lon: -86.7780, facing: 95, exposure: 0.95, basin: "carib", airports: ["CUN"] },
  { id: "impression-isla", name: "Impression Isla Mujeres", city: "Isla Mujeres, MX", region: "mx_cun", lat: 21.2600, lon: -86.7520, facing: 330, exposure: 0.45, basin: "carib", airports: ["CUN"] },
  { id: "holbox", name: "Holbox Island Hotels", city: "Holbox, MX", region: "mx_cun", lat: 21.5240, lon: -87.3790, facing: 0, exposure: 0.50, basin: "carib", airports: ["CUN"] },
  // Riviera Maya
  { id: "playa-del-carmen", name: "Playa del Carmen Resorts", city: "Playa del Carmen, MX", region: "mx_rm", lat: 20.6300, lon: -87.0700, facing: 90, exposure: 1.00, basin: "carib", airports: ["CUN", "TQO"] },
  { id: "tulum", name: "Tulum Beach Hotels", city: "Tulum, MX", region: "mx_rm", lat: 20.2100, lon: -87.4650, facing: 90, exposure: 1.00, basin: "carib", airports: ["TQO", "CUN"] },
  // Yucatán / Campeche Gulf coast
  { id: "progreso", name: "Progreso Beach Resorts", city: "Progreso, MX", region: "mx_yuc", lat: 21.2840, lon: -89.6630, facing: 0, exposure: 0.35, basin: "gulf_s", airports: ["MID"] },
  { id: "campeche", name: "Campeche Malecón Hotels", city: "Campeche, MX", region: "mx_yuc", lat: 19.8450, lon: -90.5370, facing: 280, exposure: 0.20, basin: "gulf_s", airports: ["CPE"] },
  // Veracruz / Tamaulipas
  { id: "boca-del-rio", name: "Boca del Río Resorts", city: "Veracruz, MX", region: "mx_ver", lat: 19.1070, lon: -96.1000, facing: 50, exposure: 0.25, basin: "gulf_w", airports: ["VER"] },
  { id: "miramar-tampico", name: "Playa Miramar Hotels", city: "Tampico, MX", region: "mx_ver", lat: 22.2750, lon: -97.7970, facing: 90, exposure: 0.35, basin: "gulf_w", airports: ["TAM"] },
  // Cuba
  { id: "varadero", name: "Varadero Beach Resorts", city: "Varadero, CU", region: "cu", lat: 23.1900, lon: -81.1500, facing: 0, exposure: 0.40, basin: "carib", airports: ["VRA"] },
];

// Barriers and cleanup programs by region. These summarize publicly reported
// programs; exact deployment changes year to year, so verify locally.
export const CLEANUP = {
  fl_sw: { barriers: "None deployed offshore.", cleanup: "County beach raking/hand removal when landings exceed thresholds (Collier, Lee, Sarasota).", resort: "Resort grounds crews rake daily in season.", speed: "same-day to 2 days" },
  fl_tb: { barriers: "None deployed offshore.", cleanup: "Pinellas County mechanical raking; seaweed left to decompose on low-traffic beaches.", resort: "Beachfront hotels rake morning of heavy wrack days.", speed: "1–2 days" },
  fl_ph: { barriers: "None deployed offshore.", cleanup: "County beach services (Okaloosa, Walton, Bay, Escambia) remove heavy mats; dune protection limits machinery.", resort: "Resort beach services clear chair zones daily.", speed: "1–3 days" },
  al_ms: { barriers: "None offshore; Mississippi Sound barrier islands naturally shelter Biloxi.", cleanup: "Gulf Shores/Orange Beach city crews and Harrison County sand beach dept. rake daily in summer.", resort: "Daily raking at resort frontage.", speed: "same-day" },
  la: { barriers: "None.", cleanup: "Limited: Grand Isle town crews after large events.", resort: "Minimal; rentals rely on town crews.", speed: "2–5 days" },
  tx_up: { barriers: "None offshore.", cleanup: "Galveston Park Board beach maintenance rakes and uses seaweed for dune building.", resort: "Seawall-front properties rely on Park Board crews.", speed: "1–2 days" },
  tx_lo: { barriers: "None offshore.", cleanup: "South Padre Island & Nueces County beach maintenance; seaweed pushed to dune line.", resort: "Resort crews clear frontage daily in season.", speed: "1–2 days" },
  fl_keys: { barriers: "None.", cleanup: "Monroe County and City of Key West remove from public beaches; most Keys shores are rocky.", resort: "Resort crews clear private beaches daily.", speed: "same-day to 2 days" },
  mx_cun: { barriers: "Floating sargassum barriers deployed by Mexican Navy (SEMAR) and state along exposed Caribbean stretches; north Gulf-facing shore rarely needs them.", cleanup: "SEMAR sargassum-collection vessels offshore; ZOFEMAT municipal crews on public beaches.", resort: "Large resorts run their own barrier/rake crews at dawn.", speed: "same-day" },
  mx_rm: { barriers: "Floating barriers along portions of Playa del Carmen, Puerto Morelos, Tulum; coverage varies by season.", cleanup: "SEMAR vessels, municipal and hotel crews; heaviest-hit region on this list.", resort: "Resorts employ dedicated sargassum crews, some with private barriers.", speed: "same-day, but can be overwhelmed at peak" },
  mx_yuc: { barriers: "None.", cleanup: "Municipal crews; Gulf-side landings are usually light.", resort: "Hotel crews as needed.", speed: "1–3 days" },
  mx_ver: { barriers: "None.", cleanup: "Municipal beach crews.", resort: "Hotel crews as needed.", speed: "1–3 days" },
  cu: { barriers: "None.", cleanup: "Resort crews on Varadero peninsula.", resort: "Hotel crews rake daily.", speed: "same-day to 2 days" },
};

// Travel & safety profile by region.
export const SAFETY = {
  fl_sw: { advisory: "US domestic", notes: ["Red tide (Karenia brevis) episodes most common late summer–winter; check FWC red tide map.", "Stingray shuffle in shallow water May–Oct."] },
  fl_tb: { advisory: "US domestic", notes: ["Red tide episodes possible; check FWC.", "Strong rip currents near passes (Pass-a-Grille, Clearwater Pass)."] },
  fl_ph: { advisory: "US domestic", notes: ["Among the highest rip-current fatality rates in the US; obey double red flags.", "Purple flag = dangerous marine life (jellyfish)."] },
  al_ms: { advisory: "US domestic", notes: ["Frequent rip currents at Gulf Shores/Orange Beach.", "Mississippi Sound water quality advisories after heavy rain (MDEQ)."] },
  la: { advisory: "US domestic", notes: ["Swim advisories for bacteria after rain (LDH).", "Very remote; limited lifeguards."] },
  tx_up: { advisory: "US domestic", notes: ["Rip currents near groins/jetties along the Seawall.", "Portuguese man o' war possible in spring."] },
  tx_lo: { advisory: "US domestic", notes: ["Strong longshore currents at Port Aransas jetties.", "Spring break brings heavy traffic and law enforcement presence."] },
  fl_keys: { advisory: "US domestic", notes: ["Boating and snorkel safety: currents in channels.", "Lionfish/fire coral contact hazards."] },
  mx_cun: { advisory: "US State Dept: Quintana Roo, Level 2 (exercise increased caution)", notes: ["Caribbean-facing Hotel Zone beaches have strong surf; north-facing Playa Norte/Gulf side calmer.", "Use authorized taxis; stay in tourist zones at night."] },
  mx_rm: { advisory: "US State Dept: Quintana Roo, Level 2 (exercise increased caution)", notes: ["Sargassum peaks May–Aug; decomposing mats release hydrogen sulfide (avoid heavy piles).", "Cenote/snorkel operators vary in safety standards."] },
  mx_yuc: { advisory: "US State Dept: Yucatán, Level 1; Campeche, Level 2", notes: ["Very shallow, calm Gulf water; lower rip risk.", "Northers (nortes) Nov–Mar bring wind and cooler water."] },
  mx_ver: { advisory: "US State Dept: Veracruz, Level 3; Tamaulipas, Level 4 (do not travel)", notes: ["Check current State Dept guidance before travel.", "Nortes Oct–Mar bring strong winds and high surf."] },
  cu: { advisory: "US State Dept: Cuba, Level 2; US travel restrictions apply", notes: ["Power outages and fuel shortages affect services.", "Bring cash; US cards generally not accepted."] },
};

// Regional tourism highlights.
export const TOURISM = {
  fl_sw: ["Naples Pier & Fifth Avenue South", "Sanibel shelling & J.N. 'Ding' Darling NWR", "Everglades airboat tours from Everglades City", "10,000 Islands kayaking"],
  fl_tb: ["Salvador Dalí Museum (St. Petersburg)", "Clearwater Marine Aquarium", "Fort De Soto Park", "Busch Gardens Tampa", "Siesta Key sand"],
  fl_ph: ["Crab Island (Destin)", "Seaside & Rosemary Beach towns", "Gulf Islands National Seashore", "Pier Park (Panama City Beach)", "Blue Angels at NAS Pensacola"],
  al_ms: ["Gulf State Park & pier", "The Wharf (Orange Beach)", "Flora-Bama", "Biloxi casinos & Lighthouse", "Ship Island ferry"],
  la: ["Grand Isle State Park", "Fishing charters", "New Orleans French Quarter (2 hr)"],
  tx_up: ["The Strand Historic District", "Moody Gardens pyramids", "Pleasure Pier", "Space Center Houston (45 min)"],
  tx_lo: ["Sea Turtle Inc. (SPI)", "Padre Island National Seashore", "USS Lexington (Corpus Christi)", "Schlitterbahn SPI"],
  fl_keys: ["Duval Street & Mallory Square sunset", "Dry Tortugas National Park", "Hemingway Home", "Snorkel reefs (Sand Key)"],
  mx_cun: ["Isla Mujeres & Playa Norte", "MUSA underwater museum", "Whale shark tours (Jun–Sep)", "Chichén Itzá day trip", "Holbox bioluminescence"],
  mx_rm: ["Tulum ruins", "Xcaret & Xel-Há parks", "Cenotes (Dos Ojos, Gran Cenote)", "Cozumel reefs", "Sian Ka'an Biosphere"],
  mx_yuc: ["Mérida historic center", "Celestún flamingos", "Uxmal & Edzná ruins", "Campeche walled city (UNESCO)"],
  mx_ver: ["Veracruz Aquarium", "San Juan de Ulúa fortress", "El Tajín ruins", "Tampico historic center"],
  cu: ["Varadero beach", "Matanzas city", "Havana (2 hr)", "Cayo Blanco catamaran trips"],
};
