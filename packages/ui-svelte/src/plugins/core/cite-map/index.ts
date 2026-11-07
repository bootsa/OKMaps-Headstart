import type { OkmPlugin } from "../../index";
import CiteMapModal from "./CiteMapModal.svelte";
import { citationLabels } from "./citation";

/** A "Cite" button in the map's toolbar with the map's citation. */
export const citeMapPlugin: OkmPlugin = {
	id: "cite-map",
	actions: [{ id: "cite-map", label: "Cite", run: (map) => map.openModal("cite-map") }],
	modals: { "cite-map": { title: (map) => citationLabels(map).title, component: CiteMapModal } },
};
