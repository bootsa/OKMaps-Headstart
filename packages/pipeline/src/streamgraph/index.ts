/**
 * The streamgraph step: how often each of the most frequent keywords
 * occurs per year. A port of the old dataprocessing worker's
 * `Streamgraph.get_streamgraph_data` and `reduce_metadata_set`
 * (server/workers/dataprocessing/src/streamgraph.py), which ran instead of
 * the knowledge-map layout for maps with vis_type "timeline".
 *
 * Its output is the record's `streamgraph` field, which the streamgraph
 * view draws; `streamgraphDocuments` keeps the records that appear in it.
 */
import { recordYear } from "./dates.js";

export { recordYear } from "./dates.js";

export interface StreamgraphPaper {
	id: string;
	/** A date the year is read from ("2019", "2019-05-01", "2019 May", ISO times). */
	year?: unknown;
	/** Keywords, "; "-separated. */
	subject?: string | null;
	[field: string]: unknown;
}

export interface StreamgraphOptions {
	/** The search query; a keyword equal to it is not counted (as in Python, case-sensitive). */
	query?: string;
	/** Number of keywords (streams); the worker's default is 12. */
	topN?: number;
	/** How the keywords are picked: total count (the default) or summed tf-idf weight. */
	method?: "count" | "tfidf";
}

export interface Stream {
	/** The keyword, capitalised. */
	name: string;
	/** Records per year, one number per entry of `x`. */
	y: number[];
	/** The record ids per year, sorted. */
	ids_timestep: string[][];
	/** All record ids of the stream, year by year. */
	ids_overall: string[];
}

export interface StreamgraphData {
	/** The years, as strings. */
	x: string[];
	subject: Stream[];
}

/** Thrown when the records give no streamgraph (the worker's ValueError). */
export class StreamgraphError extends Error {
	override name = "StreamgraphError";
}

/** Subjects the old step leaves out: HAL's discipline codes. */
export const STREAMGRAPH_STOPWORDS = [
	"archeo",
	"archi",
	"art",
	"anthro-bio",
	"class",
	"info",
	"museo",
	"demo",
	"eco",
	"edu",
	"envir",
	"genre",
	"geo",
	"hist",
	"hisphilso",
	"droit",
	"lang",
	"litt",
	"manag",
	"stat",
	"musiq",
	"phil",
	"scipo",
	"psy",
	"relig",
	"anthro-se",
	"socio",
];

/** Python's str.strip(): whitespace as str.isspace() defines it. */
const pyStrip = (s: string) => s.replace(/^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/gu, "").replace(/^﻿|﻿$/g, (c) => c);

/** Keywords of a subject line: brackets dropped, split on "; ". */
export function streamgraphTokens(subject: string): string[] {
	return subject
		.replace(/[()]/g, "")
		.split("; ")
		.map((t) => pyStrip(t.replaceAll(";", "")));
}

/** Python's str.capitalize(). */
const capitalize = (s: string) => {
	const [first = "", ...rest] = Array.from(s);
	return first.toUpperCase() + rest.join("").toLowerCase();
};

/**
 * The keywords the streams follow: those in at least 2 records and at most
 * 95% of them, ranked by total count or tf-idf weight (ties alphabetical),
 * longer than two characters. Only records whose subject line is longer
 * than two characters count, whatever their year.
 */
function topKeywords(papers: StreamgraphPaper[], query: string, n: number, method: "count" | "tfidf"): string[] {
	const stop = new Set([query, ...STREAMGRAPH_STOPWORDS]);
	// sklearn CountVectorizer(tokenizer=streamgraphTokens, lowercase=True, stop_words=...)
	const docs = papers
		.filter((p) => typeof p.subject === "string" && p.subject.length > 2)
		.map((p) => streamgraphTokens((p.subject as string).toLowerCase()).filter((t) => !stop.has(t)));
	const docFreq = new Map<string, number>();
	for (const doc of docs) for (const t of new Set(doc)) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
	if (docFreq.size === 0) throw new StreamgraphError("empty vocabulary");
	const maxDocs = 0.95 * docs.length;
	if (maxDocs < 2) throw new StreamgraphError("max_df corresponds to < documents than min_df");
	const terms = [...docFreq.keys()]
		.filter((t) => docFreq.get(t)! >= 2 && docFreq.get(t)! <= maxDocs)
		.sort(codePointOrder);
	if (terms.length === 0) throw new StreamgraphError("After pruning, no terms remain");
	const index = new Map(terms.map((t, i) => [t, i]));

	const totals = new Float64Array(terms.length);
	// smooth idf, as TfidfVectorizer's defaults
	const idf = terms.map((t) => Math.log((1 + docs.length) / (1 + docFreq.get(t)!)) + 1);
	for (const doc of docs) {
		const tf = new Map<number, number>();
		for (const t of doc) {
			const i = index.get(t);
			if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1);
		}
		if (method === "count") {
			for (const [i, c] of tf) totals[i] += c;
		} else {
			let norm = 0;
			for (const [i, c] of tf) norm += (c * idf[i]) ** 2;
			norm = Math.sqrt(norm);
			if (norm > 0) for (const [i, c] of tf) totals[i] += (c * idf[i]) / norm;
		}
	}
	// A stable sort: equal weights keep the alphabetical order.
	return terms
		.map((t, i) => ({ t, w: totals[i] }))
		.sort((a, b) => b.w - a.w)
		.map(({ t }) => t)
		.filter((t) => t.length > 2)
		.slice(0, n);
}

const codePointOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The old step tests subjects with the keyword as a regular expression
 * (pandas `str.contains(item, case=False)`), so "math" also matches
 * "mathematics education". A keyword that isn't a valid expression is
 * matched literally (Python failed on it).
 */
function keywordPattern(keyword: string): RegExp {
	try {
		return new RegExp(keyword, "i");
	} catch {
		return new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
	}
}

/** Keyword streams per year for a streamgraph. Throws StreamgraphError when there are none. */
export function buildStreamgraph(papers: StreamgraphPaper[], options: StreamgraphOptions = {}): StreamgraphData {
	const { query = "", topN = 12, method = "count" } = options;
	const stop = new Set(STREAMGRAPH_STOPWORDS);

	// ids per (year, keyword), in record order
	const byYear = new Map<number, Map<string, string[]>>();
	for (const p of papers) {
		const year = recordYear(p.year);
		if (year === null || typeof p.subject !== "string") continue;
		for (const keyword of streamgraphTokens(p.subject.toLowerCase())) {
			if (keyword === "" || stop.has(keyword)) continue;
			let row = byYear.get(year);
			if (!row) {
				row = new Map();
				byYear.set(year, row);
			}
			const ids = row.get(keyword);
			if (ids) ids.push(String(p.id));
			else row.set(keyword, [String(p.id)]);
		}
	}
	if (byYear.size === 0) throw new StreamgraphError("no records with a year and keywords");
	const first = Math.min(...byYear.keys());
	const last = Math.max(...byYear.keys());
	const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);

	const top = topKeywords(papers, query, topN, method);
	if (top.length === 0) throw new StreamgraphError("no keywords for the streams");

	const streams = top.map((keyword) => {
		const pattern = keywordPattern(keyword);
		const ids_timestep = years.map((year) => {
			const ids = new Set<string>();
			for (const [subject, list] of byYear.get(year) ?? []) {
				if (pattern.test(subject)) for (const id of list) ids.add(id);
			}
			ids.delete("NA");
			return [...ids].sort(codePointOrder);
		});
		return { name: capitalize(keyword), y: ids_timestep.map((ids) => ids.length), ids_timestep };
	});

	// Start where the streams have passed 5% of all their counts.
	const sums = years.map((_, i) => streams.reduce((s, st) => s + st.y[i], 0));
	const total = sums.reduce((a, b) => a + b, 0);
	const min = Math.trunc(total * 0.05);
	let cum = 0;
	const start = sums.findIndex((v) => {
		cum += v;
		return cum > min;
	});
	if (start < 0) throw new StreamgraphError("the keywords occur in no record with a year");

	return {
		x: years.slice(start).map(String),
		subject: streams
			.map((s) => {
				const ids_timestep = s.ids_timestep.slice(start);
				return { name: s.name, y: s.y.slice(start), ids_timestep, ids_overall: ids_timestep.flat() };
			})
			.filter((s) => s.ids_overall.length > 0),
	};
}

/** The records that appear in the streams, each once, in their order (the worker's reduce_metadata_set). */
export function streamgraphDocuments<T extends { id: unknown }>(papers: T[], data: StreamgraphData): T[] {
	const ids = new Set(data.subject.flatMap((s) => s.ids_overall));
	const seen = new Set<string>();
	return papers.filter((p) => {
		const id = String(p.id);
		if (!ids.has(id) || seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}
