import { parsePlace } from "../../data/papers";
import { placeOnChart } from "../../data/process";
import type { ViewProcessor, ViewType } from "../types";

export * from "./layers";

/** Each paper's place from its coverage (AQUANAVI facilities). */
export const geomapProcessor: ViewProcessor = {
	id: "geomap",
	accepts: (record) => record.documents.some((doc) => parsePlace(doc.coverage) !== null),
	process({ record, papers, size, config }) {
		for (const p of papers) p.place = parsePlace(p.raw.coverage);
		return placeOnChart(record, papers, size, config);
	},
};

/** The geo map (visType "geomap"): a pin per place. */
export const geomapType: ViewType = {
	...geomapProcessor,
	label: "Geo map",
	places: true,
	strings: { heading: "geomap_label", backlink: "backlink_list_streamgraph" },
	citation: {
		kind: "geomap",
		type: "Geo Map",
		text: (query, year, link) => `Open Knowledge Maps ${year}. Geo Map of ${query}. Retrieved from ${link}.`,
	},
};
