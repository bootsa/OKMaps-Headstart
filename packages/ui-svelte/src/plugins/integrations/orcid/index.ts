import { registerService, t } from "@okmaps/core";
import type { OkmPlugin } from "../../index";
import MetricsModal from "./MetricsModal.svelte";
import OrcidInfo from "./OrcidInfo.svelte";
import ResearcherModal from "./ResearcherModal.svelte";
import { employmentItems, orcidMetrics, orcidTitle } from "./researcher";

export interface OrcidOptions {
	/** "Researcher details" in the context line (default true). */
	details?: boolean;
	/** "Metrics" in the context line (default true). */
	metrics?: boolean;
	/** Citations, social media mentions and references under each paper (default true). */
	listMetrics?: boolean;
}

const isOrcid = (service: string) => service === "orcid";

/**
 * ORCID researcher maps (service "orcid"): the researcher's name and ORCID
 * iD as the title, their current job in the context line, their details
 * and metrics in modals, per-paper metrics in the list and the info page.
 * Registers the "orcid" service settings too (author view, eng_orcid).
 */
export function orcidPlugin(options: OrcidOptions = {}): OkmPlugin {
	const { details = true, metrics = true, listMetrics = true } = options;
	registerService("orcid", {
		language: "eng_orcid",
		isAuthorview: true,
		sortOptions: ["year", "title", "authors", "relevance"],
	});
	return {
		id: "orcid",
		title: orcidTitle,
		contextItems(map) {
			if (!isOrcid(map.config.service)) return [];
			const s = map.strings;
			return [
				...employmentItems(map),
				...(details
					? [
							{
								id: "researcher_details",
								text: t(s, "researcher_details_label"),
								run: () => map.openModal("orcid-researcher"),
							},
						]
					: []),
				...(metrics
					? [{ id: "researcher_metrics", text: t(s, "metrics_label"), run: () => map.openModal("orcid-metrics") }]
					: []),
			];
		},
		paperMetrics: (map, paper) => (listMetrics && isOrcid(map.config.service) ? orcidMetrics(map, paper) : []),
		modals: {
			"orcid-researcher": { title: (m) => t(m.strings, "researcher_details_label"), component: ResearcherModal },
			"orcid-metrics": { title: (m) => t(m.strings, "metrics_label"), component: MetricsModal },
		},
		infoPages: [{ matches: (m) => isOrcid(m.config.service), component: OrcidInfo }],
	};
}
