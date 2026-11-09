import { knowledgeMapType } from "@okmaps/core";
import type { MapView } from "../types";
import KnowledgeMap from "./KnowledgeMap.svelte";
import KnowledgeMapInfo from "./KnowledgeMapInfo.svelte";
import { savedTheme } from "./themes";
import ThemePicker from "./themes/ThemePicker.svelte";

export { knowledgeMapProcessor } from "@okmaps/core";

/** The knowledge map (visType "overview"), drawn by the theme the state names. */
export const knowledgeMapView: MapView = {
	...knowledgeMapType,
	component: KnowledgeMap,
	start(map) {
		map.theme = savedTheme();
	},
	settings: [ThemePicker],
	sections: {
		label: "areas_label",
		// Biggest areas first, as they draw the eye on the map.
		list: (map) =>
			map.map.areas
				.map((a) => ({
					id: a.uri,
					label: a.title,
					size: a.papers.length,
					count: a.papers.filter((p) => map.matching.has(p.safeId)).length,
				}))
				.sort((a, b) => b.size - a.size || a.label.localeCompare(b.label))
				.map(({ id, label, count }) => ({ id, label, count })),
		open: (map, id) => map.zoomIn(id),
		hover: (map, id) => {
			map.hoveredArea = id;
		},
	},
	info: KnowledgeMapInfo,
};
