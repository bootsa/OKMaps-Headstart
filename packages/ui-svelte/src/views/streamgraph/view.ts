import { buildStreamgraph, StreamgraphError, streamgraphDocuments } from "@okmaps/pipeline/streamgraph";
import { parseStreams } from "../../data/streams";
import type { MapRecord, Paper, StreamgraphData } from "../../data/types";
import type { MapView, ViewProcessor } from "../types";
import Streamgraph from "./Streamgraph.svelte";
import StreamgraphInfo from "./StreamgraphInfo.svelte";

/**
 * The record's keyword counts per year, or, for a record without them, the
 * pipeline's streamgraph step run on its documents (then the list keeps
 * only the papers in the streams, as the old server did).
 */
function streamsOf(record: MapRecord, papers: Paper[]): { data: StreamgraphData | string | null; papers: Paper[] } {
	if (record.streamgraph) return { data: record.streamgraph, papers };
	try {
		const data = buildStreamgraph(
			papers.map((p) => ({ id: p.id, year: p.raw.year, subject: p.raw.subject as string | null })),
			{ query: record.context.query },
		);
		return { data, papers: streamgraphDocuments(papers, data) };
	} catch (e) {
		if (e instanceof StreamgraphError) return { data: null, papers };
		throw e;
	}
}

/** Keyword counts per year as stacked streams; nothing is placed on a chart. */
export const streamgraphProcessor: ViewProcessor = {
	id: "timeline",
	accepts: (record) => !!record.streamgraph || record.documents.some((d) => d.year && d.subject),
	process: ({ record, papers, size }) => {
		const streams = streamsOf(record, papers);
		return { context: record.context, papers: streams.papers, areas: [], streams: parseStreams(streams.data), size };
	},
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
