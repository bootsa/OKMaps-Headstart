import type { OkmPlugin } from "../../index";
import CovisInfo from "./CovisInfo.svelte";

/**
 * CoVis maps (service "covis"): their info page. `site` is where the CoVis
 * FAQ and contact pages live (the old page linked them relative to itself).
 */
export function covisPlugin(site = "https://openknowledgemaps.org/"): OkmPlugin {
	return {
		id: "covis",
		infoPages: [{ matches: (m) => m.config.service === "covis", component: CovisInfo, props: { site } }],
	};
}
