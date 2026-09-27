// Destination catalog: ski resorts, fall-foliage and hiking areas, theme parks
// and busy cities. Per-type data lives in ../data/*.js.
//
// Climate, crowd, bug and price tables are typical patterns compiled without
// live sources; live weather comes from Open-Meteo in the browser.

import * as ski from "../data/ski.js";
import * as outdoors from "../data/outdoors.js";
import * as parks from "../data/parks.js";

const PARTS = [ski, outdoors, parks];
export const AIRPORTS = Object.assign({}, ...PARTS.map((p) => p.AIRPORTS));
export const DESTINATIONS = PARTS.flatMap((p) => p.DESTINATIONS);
