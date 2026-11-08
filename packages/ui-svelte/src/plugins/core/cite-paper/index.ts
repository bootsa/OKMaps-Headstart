import { t } from "@okmaps/core";
import type { OkmPlugin } from "../../index";
import CitePaperModal from "./CitePaperModal.svelte";
import { canCite } from "./citation";

/** "Cite as" under each paper (where the map's config allows it), in four styles. */
export const citePaperPlugin: OkmPlugin = {
	id: "cite-paper",
	paperActions: [
		{
			id: "cite-paper",
			label: "Cite as",
			title: "Cite this resource",
			show: canCite,
			run: (map, paper) => map.openModal("cite-paper", paper),
		},
	],
	modals: {
		"cite-paper": { title: (map) => t(map.strings, "cite_paper"), component: CitePaperModal },
	},
};
