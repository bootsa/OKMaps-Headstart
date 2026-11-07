import { parseStreams } from "../../data/streams";
import type { MapView, ViewProcessor } from "../types";
import Streamgraph from "./Streamgraph.svelte";

/** Keyword counts per year as stacked streams; nothing is placed on a chart. */
export const streamgraphProcessor: ViewProcessor = {
	id: "timeline",
	accepts: (record) => !!record.streamgraph,
	process: ({ record, papers, size }) => ({
		context: record.context,
		papers,
		areas: [],
		streams: parseStreams(record.streamgraph),
		size,
	}),
};

/** The streamgraph (visType "timeline"). */
export const streamgraphView: MapView = {
	...streamgraphProcessor,
	label: "Streamgraph",
	component: Streamgraph,
};
