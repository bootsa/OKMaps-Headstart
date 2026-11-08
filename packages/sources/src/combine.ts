/**
 * One result from several sources: the records of every source, with the
 * same work found by more than one source kept once. Works are the same
 * when their DOIs match (case does not matter), or, for records without a
 * DOI, when their titles match (ignoring case, accents and punctuation) and
 * so do their years. The first source's record is kept and filled in from
 * the others where it has nothing (an abstract, keywords, a DOI); counts
 * such as readers take the highest.
 */
import { normalizeDoi } from "./doi.js";
import type { SourceRecord, SourceResult } from "./types.js";

export interface SourcePart {
	/** The source's service ("pubmed", "openalex", ...), kept with each record as `source_service`. */
	service: string;
	/** The source's name, listed with each record in `sources`. */
	label: string;
	result: SourceResult;
}

export interface CombinedResult extends SourceResult {
	/** Records left out because another source had the same work. */
	duplicates: number;
}

/** Titles shorter than this (once normalised) are too generic to match on. */
const MIN_TITLE = 20;

export function titleKey(title: string | null | undefined): string {
	return (title ?? "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "");
}

function workKey(r: SourceRecord): string | null {
	const doi = normalizeDoi(r.doi);
	if (doi) return `doi:${doi}`;
	const t = titleKey(r.title);
	return t.length >= MIN_TITLE ? `title:${t}:${r.year ?? ""}` : null;
}

const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const COUNTS = ["readers", "citation_count", "cited_by_count"];

function fillIn(kept: SourceRecord, other: SourceRecord): void {
	for (const [field, value] of Object.entries(other)) {
		if (field === "id" || field === "source_service" || field === "sources") continue;
		if (COUNTS.includes(field) && typeof value === "number" && typeof kept[field] === "number") {
			kept[field] = Math.max(kept[field] as number, value);
		} else if (empty(kept[field]) && !empty(value)) {
			kept[field] = value;
		}
	}
}

export function combineResults(parts: SourcePart[]): CombinedResult {
	const papers: SourceRecord[] = [];
	const content: Record<string, string> = {};
	const byKey = new Map<string, SourceRecord>();
	let duplicates = 0;
	parts.forEach((part, i) => {
		for (const paper of part.result.papers) {
			const key = workKey(paper);
			const text = part.result.content[paper.id] ?? "";
			const kept = key ? byKey.get(key) : undefined;
			if (kept) {
				duplicates++;
				const labels = String(kept.sources).split("; ");
				if (!labels.includes(part.label)) kept.sources = [...labels, part.label].join("; ");
				fillIn(kept, paper);
				if (text.length > (content[kept.id]?.length ?? 0)) content[kept.id] = text;
				continue;
			}
			// Ids are unique within one source only.
			const id = `s${i + 1}-${paper.id}`;
			const record: SourceRecord = { ...paper, id, source_service: part.service, sources: part.label };
			papers.push(record);
			content[id] = text;
			if (key) byKey.set(key, record);
		}
	});
	return {
		service: "combined",
		papers,
		content,
		query: parts.map((p) => p.result.query).join(" | "),
		duplicates,
	};
}
