import { parsePlace } from "../../data/papers";
import { placeOnChart } from "../../data/process";
import type { MapView, ViewProcessor } from "../types";
import Geomap from "./Geomap.svelte";

/** Each paper's place from its coverage (AQUANAVI facilities). */
export const geomapProcessor: ViewProcessor = {
	id: "geomap",
	accepts: (record) => record.documents.some((doc) => parsePlace(doc.coverage) !== null),
	process({ record, papers, size, config }) {
		for (const p of papers) p.place = parsePlace(p.raw.coverage);
		return placeOnChart(record, papers, size, config);
	},
};

/** The geo map (visType "geomap"): a pin per place on OpenStreetMap tiles. */
export const geomapView: MapView = {
	...geomapProcessor,
	label: "Geo map",
	component: Geomap,
	// Above Leaflet's attribution line.
	overlayInset: "2.25rem",
};
