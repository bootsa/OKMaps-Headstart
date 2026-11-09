import { placeOnChart } from "../../data/process";
import type { ViewProcessor, ViewType } from "../types";
import { layoutMap } from "./layout";

export * from "./geometry";
export * from "./layout";

/** Areas as bubbles from the papers' layout coordinates, separated by a force layout. */
export const knowledgeMapProcessor: ViewProcessor = {
	id: "overview",
	process: ({ record, papers, size, config }) => placeOnChart(record, papers, size, config),
	layout: (map, config) => layoutMap(map.areas, map.papers, map.size, config),
};

/** The knowledge map (visType "overview"). */
export const knowledgeMapType: ViewType = {
	...knowledgeMapProcessor,
	label: "Knowledge map",
	areas: true,
	creatable: true,
	strings: { heading: "overview_label", authorHeading: "overview_authors_label", backlink: "backlink_list" },
	citation: { kind: "km", type: "Knowledge Map" },
};
