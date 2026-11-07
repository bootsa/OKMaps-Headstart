import type { OkmPlugin } from "../../index";
import BaseInfo from "./BaseInfo.svelte";
import InfoModal from "./InfoModal.svelte";
import OpenAireInfo from "./OpenAireInfo.svelte";
import PubmedInfo from "./PubmedInfo.svelte";

/**
 * The "More information" modal (opened from the context line) with the
 * info pages of BASE and PubMed knowledge maps and streamgraphs, and of
 * OpenAIRE knowledge maps. Other plugins add
 * pages for their own services.
 */
export const infoPlugin: OkmPlugin = {
	id: "info",
	modals: { info: { title: () => "What's this?", component: InfoModal } },
	infoPages: [
		{ matches: (m) => m.config.visType !== "geomap" && m.config.service === "base", component: BaseInfo },
		{ matches: (m) => m.config.visType !== "geomap" && m.config.service === "pubmed", component: PubmedInfo },
		{ matches: (m) => m.config.visType === "overview" && m.config.service === "openaire", component: OpenAireInfo },
	],
};
