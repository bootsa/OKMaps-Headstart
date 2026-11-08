import { streamgraphType } from "@okmaps/core";
import type { MapView } from "../types";
import Streamgraph from "./Streamgraph.svelte";
import StreamgraphInfo from "./StreamgraphInfo.svelte";

export { streamgraphProcessor } from "@okmaps/core";

/** The streamgraph (visType "timeline"). */
export const streamgraphView: MapView = {
	...streamgraphType,
	component: Streamgraph,
	sections: {
		label: "streams_label",
		list: (map) => {
			const matching = new Set(map.map.papers.filter((p) => map.matching.has(p.safeId)).map((p) => p.id));
			return map.map.streams.map((st) => ({
				id: st.key,
				label: st.key,
				count: st.docIds.filter((id) => matching.has(id)).length,
			}));
		},
		open: (map, id) => map.selectStream(id),
	},
	info: StreamgraphInfo,
};
