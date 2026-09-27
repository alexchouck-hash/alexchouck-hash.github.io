// Resort catalog: Gulf of Mexico, Caribbean and Caribbean Central America.
// Regional data lives in js/data/*.js; this module merges it.
//
// Resort fields:
// facing: compass bearing (deg) the beach faces toward open water. Onshore wind
//   blows FROM roughly this direction and pushes sargassum onto the beach.
// exposure: 0..1 relative susceptibility to sargassum landings (geography,
//   position relative to the sargassum belt, reef/barrier-island shelter).
// basin: which seasonal sargassum curve applies (see SARG_SEASON in model.js).
// region: key into REGIONS (climate, crowds, cleanup, safety, tourism).
// marineLat/marineLon: optional offshore point for wave/water data where the
//   marine model treats the beach itself as land.
//
// Coordinates were compiled without live geocoding and are approximate
// (typically within 1–2 km). Region text summarizes public programs and
// advisories; verify before relying on it.

import * as gulfUS from "./data/gulf-us.js";
import * as mexicoCuba from "./data/mexico-cuba.js";
import * as greaterAntilles from "./data/greater-antilles.js";
import * as lesserAntilles from "./data/lesser-antilles.js";
import * as centralAmerica from "./data/central-america.js";

const PARTS = [gulfUS, mexicoCuba, greaterAntilles, lesserAntilles, centralAmerica];

export const REGIONS = Object.assign({}, ...PARTS.map((p) => p.REGIONS));
export const AIRPORTS = Object.assign({}, ...PARTS.map((p) => p.AIRPORTS));
export const RESORTS = PARTS.flatMap((p) => p.RESORTS);

const pick = (k) => Object.fromEntries(Object.entries(REGIONS).map(([id, r]) => [id, r[k]]));
export const CLEANUP = pick("cleanup");
export const SAFETY = pick("safety");
export const TOURISM = pick("tourism");
