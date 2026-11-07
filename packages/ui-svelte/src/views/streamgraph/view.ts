import { parseStreams } from "../../data/streams";
import type { MapView, ViewProcessor } from "../types";
import Streamgraph from "./Streamgraph.svelte";
import StreamgraphInfo from "./StreamgraphInfo.svelte";

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
	overTime: true,
	strings: {
		heading: "streamgraph_label",
		authorHeading: "streamgraph_authors_label",
		backlink: "backlink_list_streamgraph",
		mostRelevantTooltip: "most_relevant_tooltip_sg",
		timespanTooltip: "time_frame_context_sg",
	},
	citation: { kind: "sg", type: "Streamgraph" },
	info: StreamgraphInfo,
};
