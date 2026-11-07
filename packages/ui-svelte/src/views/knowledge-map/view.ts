import { placeOnChart } from "../../data/process";
import type { MapView, ViewProcessor } from "../types";
import KnowledgeMap from "./KnowledgeMap.svelte";
import KnowledgeMapInfo from "./KnowledgeMapInfo.svelte";
import { layoutMap } from "./layout";
import { savedTheme } from "./themes";
import ThemePicker from "./themes/ThemePicker.svelte";

/** Areas as bubbles from the papers' layout coordinates, separated by a force layout. */
export const knowledgeMapProcessor: ViewProcessor = {
	id: "overview",
	process: ({ record, papers, size, config }) => placeOnChart(record, papers, size, config),
	layout: (map, config) => layoutMap(map.areas, map.papers, map.size, config),
};

/** The knowledge map (visType "overview"), drawn by the theme the state names. */
export const knowledgeMapView: MapView = {
	...knowledgeMapProcessor,
	label: "Knowledge map",
	component: KnowledgeMap,
	start(map) {
		map.theme = savedTheme();
	},
	settings: [ThemePicker],
	areas: true,
	creatable: true,
	strings: { heading: "overview_label", authorHeading: "overview_authors_label", backlink: "backlink_list" },
	citation: { kind: "km", type: "Knowledge Map" },
	info: KnowledgeMapInfo,
};
