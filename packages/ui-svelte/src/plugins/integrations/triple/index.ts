import type { OkmPlugin } from "../../index";
import TripleInfo from "./TripleInfo.svelte";

/** GoTriple maps (service "triple_km"): their info page. */
export const triplePlugin: OkmPlugin = {
	id: "triple",
	infoPages: [{ matches: (m) => m.config.service === "triple_km", component: TripleInfo }],
};
