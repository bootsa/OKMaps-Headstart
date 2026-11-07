import type { OkmPlugin } from "../../index";
import TripleInfo from "./TripleInfo.svelte";

/** GoTriple maps (services "triple_km" and "triple_sg", its streamgraphs): their info page. */
export const triplePlugin: OkmPlugin = {
	id: "triple",
	infoPages: [{ matches: (m) => m.config.service.startsWith("triple"), component: TripleInfo }],
};
