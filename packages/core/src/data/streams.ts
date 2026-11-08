/**
 * Streamgraph data to stacked streams, as the old DataManager did with
 * d3 v3's stack layout (silhouette offset), on d3-shape v3. A year is added
 * with zero counts at each end so the streams taper off.
 */
import { stack, stackOffsetSilhouette, stackOrderNone } from "d3-shape";
import type { Stream, StreamgraphData } from "./types";

export function parseStreams(input: StreamgraphData | string | null | undefined): Stream[] {
	if (!input) return [];
	const data: StreamgraphData = typeof input === "string" ? JSON.parse(input) : input;
	if (!data.x?.length || !data.subject?.length) return [];

	const first = parseInt(data.x[0]);
	const last = parseInt(data.x[data.x.length - 1]);
	const years = [String(first - 1), ...data.x, String(last + 1)];
	const dates = years.map((y) => new Date(y));
	const keys = data.subject.map((s) => s.name);
	const rows = years.map((_, i) =>
		Object.fromEntries(data.subject.map((s) => [s.name, i === 0 || i === years.length - 1 ? 0 : (s.y[i - 1] ?? 0)])),
	);

	const series = stack<Record<string, number>>().keys(keys).order(stackOrderNone).offset(stackOffsetSilhouette)(rows);
	return series.map((layer, k) => ({
		key: keys[k],
		docIds: data.subject[k].ids_overall ?? [],
		points: layer.map(([y0, y1], i) => ({
			date: dates[i],
			value: y1 - y0,
			y0,
			y1,
		})),
	}));
}
