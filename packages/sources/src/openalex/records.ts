/**
 * OpenAlex works to map records: abstracts rebuilt from the inverted index,
 * authors as "Last, First", keywords and topics as subjects, citation
 * counts as readers.
 */
import type { SourceRecord } from "../types.js";

/** The parts of an OpenAlex work this adaptor reads (https://docs.openalex.org/api-entities/works/work-object). */
export interface OpenalexWork {
	id: string;
	doi?: string | null;
	title?: string | null;
	display_name?: string | null;
	publication_year?: number | null;
	publication_date?: string | null;
	type?: string | null;
	language?: string | null;
	cited_by_count?: number | null;
	abstract_inverted_index?: Record<string, number[]> | null;
	authorships?: { author?: { display_name?: string | null } | null; raw_author_name?: string | null }[] | null;
	primary_location?: OpenalexLocation | null;
	best_oa_location?: OpenalexLocation | null;
	open_access?: { is_oa?: boolean | null; oa_url?: string | null } | null;
	primary_topic?: OpenalexTerm | null;
	topics?: OpenalexTerm[] | null;
	keywords?: OpenalexTerm[] | null;
	concepts?: (OpenalexTerm & { level?: number | null })[] | null;
}

export interface OpenalexLocation {
	landing_page_url?: string | null;
	pdf_url?: string | null;
	source?: { display_name?: string | null } | null;
}

export interface OpenalexTerm {
	display_name?: string | null;
	score?: number | null;
}

export interface OpenalexRecord extends SourceRecord {
	/** The work's OpenAlex URL (https://openalex.org/W...). */
	identifier: string;
	link: string;
	oa_state: number;
	resulttype: string[];
	/** Times cited, as OpenAlex counts them. */
	readers: number;
	citation_count: number;
	language: string;
}

/** The abstract as text: OpenAlex delivers it as word → positions. */
export function abstractFromIndex(index: Record<string, number[]> | null | undefined): string | null {
	if (!index || typeof index !== "object") return null;
	const words: string[] = [];
	for (const [word, positions] of Object.entries(index)) {
		if (!Array.isArray(positions)) continue;
		for (const p of positions) if (Number.isInteger(p) && p >= 0 && p < 100_000) words[p] = word;
	}
	const text = words
		.filter((w) => w !== undefined)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	return text || null;
}

/** "Jane Q. Doe" → "Doe, Jane Q." (the "Last, First" form maps split on). */
export function lastFirst(name: string): string {
	const n = name.replace(/[;,]/g, " ").replace(/\s+/g, " ").trim();
	const i = n.lastIndexOf(" ");
	return i < 0 ? n : `${n.slice(i + 1)}, ${n.slice(0, i)}`;
}

/** Titles sometimes carry markup (<i>, <sub>) and entities. */
export function plainText(s: string): string {
	return s
		.replace(/<[^>]+>/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

const shortId = (id: string) => id.replace(/^https?:\/\/openalex\.org\//, "");
const DOI = /10\.\d{4,9}\/\S+/;

/** Keywords, then topics; concepts only when a work has neither (they are deprecated). */
export function subjectsOf(w: OpenalexWork): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const add = (t: OpenalexTerm | null | undefined) => {
		const name = t?.display_name?.trim();
		if (!name || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		out.push(name);
	};
	for (const k of w.keywords ?? []) add(k);
	add(w.primary_topic);
	for (const t of w.topics ?? []) add(t);
	if (out.length === 0) for (const c of w.concepts ?? []) if ((c.level ?? 1) > 0 && (c.score ?? 0) >= 0.3) add(c);
	return out;
}

/** Works to map records, skipping untitled ones and repeats. */
export function toOpenalexRecords(works: OpenalexWork[]): {
	papers: OpenalexRecord[];
	content: Record<string, string>;
} {
	const papers: OpenalexRecord[] = [];
	const content: Record<string, string> = {};
	const seen = new Set<string>();
	for (const w of works) {
		if (!w || typeof w.id !== "string") continue;
		const id = shortId(w.id);
		const rawTitle = w.display_name ?? w.title;
		if (!rawTitle || seen.has(id)) continue;
		seen.add(id);
		const title = plainText(rawTitle);
		if (!title) continue;
		const abstract = abstractFromIndex(w.abstract_inverted_index);
		const subjects = subjectsOf(w);
		const subject = subjects.length ? subjects.join("; ") : null;
		const authors = (w.authorships ?? [])
			.map((a) => a?.author?.display_name ?? a?.raw_author_name ?? "")
			.filter((n) => n.trim())
			.map(lastFirst)
			.join("; ");
		const doi = w.doi ? (DOI.exec(w.doi)?.[0] ?? "") : "";
		const landing = w.primary_location?.landing_page_url ?? "";
		const url = landing || (doi ? `https://doi.org/${doi}` : w.id);
		const oaLink = w.best_oa_location?.pdf_url ?? w.open_access?.oa_url ?? "";
		const cited = typeof w.cited_by_count === "number" && w.cited_by_count >= 0 ? w.cited_by_count : 0;
		const year = w.publication_year ? String(w.publication_year) : (w.publication_date?.slice(0, 4) ?? null);
		const paper: OpenalexRecord = {
			id,
			identifier: w.id,
			title,
			paper_abstract: abstract,
			subject,
			subject_orig: subject,
			authors,
			year,
			published_in: w.primary_location?.source?.display_name ?? null,
			url,
			link: oaLink || url,
			doi,
			oa_state: w.open_access?.is_oa ? 1 : w.open_access?.is_oa === false ? 0 : 2,
			resulttype: w.type ? [w.type] : [],
			readers: cited,
			citation_count: cited,
			language: w.language ?? "",
		};
		papers.push(paper);
		content[id] = [title, abstract, subject].filter(Boolean).join(" ");
	}
	return { papers, content };
}
