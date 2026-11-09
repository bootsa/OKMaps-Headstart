import { t } from "@okmaps/core";
import type { OkmPlugin } from "../../index";
import ExportPaperModal from "./ExportPaperModal.svelte";

/** "Export" under each paper: its BibTeX, made in the browser. */
export const exportPaperPlugin: OkmPlugin = {
	id: "export-paper",
	paperActions: [
		{
			id: "export-paper",
			label: "Export",
			title: "Export this resource",
			run: (map, paper) => map.openModal("export-paper", paper),
		},
	],
	modals: {
		"export-paper": { title: (map) => t(map.strings, "export_paper"), component: ExportPaperModal },
	},
};
