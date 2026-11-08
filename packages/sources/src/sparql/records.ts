/**
 * Result rows to map records. A mapping names the query variable for each
 * field of a map record; rows with the same id are merged, so a query can
 * return one row per author or keyword instead of GROUP_CONCAT-ing them.
 */

import { normalizeDoi } from "../doi.js";
import type { SourceRecord } from "../types.js";
import type { SparqlRow } from "./client.js";

/** For each record field, the query variable (without "?") that holds it. */
export interface SparqlMapping {
	/** Identifies a record; rows with the same id are merged (default "item"). */
	id: string;
	title: string;
	/** Abstract or description. */
	abstract: string;
	/** Author names, several separated by ";" or one per row. */
	authors: string;
	/** A year or a date (xsd:date, xsd:dateTime); the year is kept. */
	year: string;
	/** Where the record links to. */
	url: string;
	doi: string;
	/** Keywords, several separated by ";" or "|" or one per row. */
	subject: string;
	/** Journal, publisher or collection. */
	published_in: string;
}

export const DEFAULT_SPARQL_MAPPING: SparqlMapping = {
	id: "item",
	title: "title",
	abstract: "abstract",
	authors: "authors",
	year: "year",
	url: "url",
	doi: "doi",
	subject: "subjects",
	published_in: "published_in",
};

export const MAPPING_FIELDS = Object.keys(DEFAULT_SPARQL_MAPPING) as (keyof SparqlMapping)[];

/** A mapping with the defaults for the fields left out; "?name" works too. */
export function sparqlMapping(partial: Partial<Record<keyof SparqlMapping, string | undefined>> = {}): SparqlMapping {
	const m = { ...DEFAULT_SPARQL_MAPPING };
	for (const k of MAPPING_FIELDS) {
		const v = partial[k]?.trim().replace(/^[?$]/, "");
		if (v) m[k] = v;
	}
	return m;
}

export interface SparqlRecord extends SourceRecord {
	/** The id variable's value (often the entity URI). */
	identifier: string;
	link: string;
	oa_state: number;
	resulttype: string[];
}

const isUri = (s: string) => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s);

/**
 * A readable name for a URI: its last segment, without "Category:", with
 * spaces for underscores ("…/Category:Coral_reefs" → "Coral reefs").
 */
export function uriLabel(uri: string): string {
	const tail =
		uri
			.replace(/[/#]+$/, "")
			.split(/[/#]/)
			.pop() ?? uri;
	let s = tail;
	try {
		s = decodeURIComponent(tail);
	} catch {
		// keep it as it is
	}
	return s.replace(/^Category:/, "").replace(/_/g, " ");
}

/** "2016-03-01T00:00:00Z" → "2016"; "-0500-01-01" → "-500"; "" when there is no year. */
export function yearOf(value: string): string {
	const m = /^\s*(-?)0*(\d{1,4})(?:\D|$)/.exec(value);
	if (!m) return "";
	return m[2] === "0" && !m[1] ? "" : `${m[1]}${m[2]}`;
}

/** A label for a value: URIs become their last segment. */
const label = (v: string) => (isUri(v) ? uriLabel(v) : v.trim());

const splitList = (v: string, sep: RegExp) =>
	v
		.split(sep)
		.map(label)
		.filter((x) => x.length > 0);

/** Text values for clustering: whitespace collapsed. */
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const DOI = /10\.\d{4,9}\/\S+/;

interface Draft {
	id: string;
	first: Partial<Record<keyof SparqlMapping, string>>;
	authors: string[];
	subjects: string[];
	years: string[];
}

/** Rows to map records, in the order their ids first appear. */
export function toSparqlRecords(
	rows: SparqlRow[],
	mapping: SparqlMapping = DEFAULT_SPARQL_MAPPING,
): { papers: SparqlRecord[]; content: Record<string, string> } {
	const drafts = new Map<string, Draft>();
	rows.forEach((row, i) => {
		const id = row[mapping.id] || row[mapping.url] || row[mapping.title] || `row-${i + 1}`;
		let d = drafts.get(id);
		if (!d) {
			d = { id, first: {}, authors: [], subjects: [], years: [] };
			drafts.set(id, d);
		}
		for (const f of ["title", "abstract", "url", "doi", "published_in"] as const) {
			const v = row[mapping[f]];
			if (v?.trim() && d.first[f] === undefined) d.first[f] = v;
		}
		const add = (list: string[], values: string[]) => {
			for (const v of values) if (!list.includes(v)) list.push(v);
		};
		if (row[mapping.authors]) add(d.authors, splitList(row[mapping.authors], /\s*;\s*/));
		if (row[mapping.subject]) add(d.subjects, splitList(row[mapping.subject], /\s*[;|]\s*/));
		const y = row[mapping.year] ? yearOf(row[mapping.year]) : "";
		if (y) add(d.years, [y]);
	});

	const papers: SparqlRecord[] = [];
	const content: Record<string, string> = {};
	for (const d of drafts.values()) {
		const title = d.first.title ? clean(label(d.first.title)) : null;
		const abstract = d.first.abstract ? clean(d.first.abstract) : null;
		const subject = d.subjects.length ? d.subjects.join("; ") : null;
		const doiMatch = d.first.doi ? DOI.exec(d.first.doi) : null;
		const url = d.first.url ?? (isUri(d.id) ? d.id : "");
		const paper: SparqlRecord = {
			id: d.id,
			identifier: d.id,
			title,
			paper_abstract: abstract,
			subject,
			subject_orig: subject,
			authors: d.authors.join("; "),
			// The earliest year, when a row per date came back.
			year: d.years.length ? d.years.sort((a, b) => Number(a) - Number(b))[0] : null,
			published_in: d.first.published_in ? label(d.first.published_in) : null,
			url,
			link: url,
			doi: normalizeDoi(doiMatch?.[0]),
			oa_state: 2,
			resulttype: [],
		};
		papers.push(paper);
		content[d.id] = [title, abstract, subject].filter(Boolean).join(" ");
	}
	return { papers, content };
}
