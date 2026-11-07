/**
 * AQUANAVI: the mesocosm facilities of mesocosm.org, the project the geo
 * map was first made for. One preset of the place source, with the column
 * names of the facility table the old API read
 * (legacy/workers/common/common/aquanavi). Other projects register their
 * own PlaceSource with their own table and mapping.
 */

import type { PlaceSource } from "./index.js";
import type { PlaceMapping } from "./mapping.js";
import { csvTable, type TableLoader } from "./table.js";

export const AQUANAVI_MAPPING: PlaceMapping = {
	title: "Name",
	url: "url",
	image: "Photos of experiments/installations images",
	country: "Country",
	continent: "Continent",
	location: "Facility location(s) split",
	years: "Years of Mesocosm Experiments",
	description: [
		{ column: "Description of Facility", label: "Facility description" },
		{ column: "Equipment", label: "Equipment" },
		// The old API spelled the label differently when the cell was empty.
		{ column: "Controlled Parameters", label: "Controlled parameters", missing: "Controlled Parameters", join: "; " },
		{ column: "Primary interests", label: "Grand challenges", join: "; " },
		{ column: "Research Topics", label: "Research topics" },
	],
	keywords: "Specialist areas",
};

/** The AQUANAVI preset, reading the facility table from `table` (a CSV URL or any loader). */
export function aquanaviSource(table: string | TableLoader): PlaceSource {
	return {
		id: "aquanavi",
		label: "Mesocosm facilities (AQUANAVI)",
		title: "aquatic mesocosm facilities",
		table: typeof table === "string" ? csvTable(table) : table,
		mapping: AQUANAVI_MAPPING,
	};
}
