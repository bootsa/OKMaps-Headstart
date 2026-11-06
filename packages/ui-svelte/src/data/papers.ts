/**
 * One pipeline document to a Paper: fallbacks for missing fields, authors,
 * links, open access and metrics. Follows the old DataManager and
 * PaperSanitizer for the three services the app has.
 *
 * Strings are kept as text. The views render them as text (never as HTML),
 * which is what keeps crafted titles in shared maps harmless.
 */

import type { Strings } from "../i18n/strings";
import type { MapConfig } from "./config";
import type { Author, Comment, Link, MapContext, Paper, Place, RawDocument } from "./types";

const str = (v: unknown): string | undefined =>
	typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

/** Decodes HTML entities the sources leave in text (&amp; and friends). */
export function decodeEntities(s: string): string {
	if (!s.includes("&")) return s;
	return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
		const k = e.toLowerCase();
		if (k[0] === "#") {
			const code = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
		}
		return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[k] ?? m;
	});
}

export function safeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9]/g, (s) => (s === " " ? "-" : `__${s.charCodeAt(0).toString(16).padStart(4, "0")}`));
}

export function parseAuthors(authors: unknown): Author[] {
	if (typeof authors !== "string") return [];
	return authors
		.split(";")
		.filter((a) => a.trim())
		.map((a) => {
			const [last, first] = a.trim().split(",");
			const lastName = last.trim();
			return first === undefined ? { lastName } : { firstName: first.trim(), lastName };
		});
}

export function authorNames(authors: Author[], firstNameFirst: boolean): string[] {
	return authors.map(({ firstName, lastName }) =>
		!firstName ? lastName : firstNameFirst ? `${firstName} ${lastName}` : `${lastName} ${firstName}`,
	);
}

/**
 * AQUANAVI's coverage field ("country=Sweden; continent=Europe; east=12.16;
 * north=58.37; start=2017; end=present") to a place; null without one.
 */
export function parsePlace(coverage: unknown): Place | null {
	if (typeof coverage !== "string" || !coverage.includes("=")) return null;
	const place: Place = {
		country: null,
		continent: null,
		east: null,
		north: null,
	};
	for (const entry of coverage.split(";")) {
		const [rawKey, ...rest] = entry.split("=");
		const key = rawKey.trim().toLowerCase();
		const value = rest.join("=").trim();
		if (key === "country" || key === "continent") place[key] = value || null;
		if (key === "east" || key === "north") {
			const n = value === "" ? NaN : Number(value);
			place[key] = Number.isFinite(n) ? n : null;
		}
	}
	return place;
}

const YEAR = /^\d{3,4}(-\d{2}(-\d{2}(\w?\s*[-:\d]*\w?)?)?)?$/;

function metric(doc: RawDocument, field: string): number | "n/a" {
	const v = doc[field];
	if (v === undefined || v === null || v === "" || String(v).toLowerCase() === "n/a") return "n/a";
	const n = Number(v);
	return Number.isNaN(n) ? "n/a" : n;
}

function listLink(doc: RawDocument, config: MapConfig): Link | null {
	if (!config.doiOutlink) return null;
	const doi = str(doc.doi);
	if (doi) {
		return {
			address: /^(https?:\/\/)?(\w+\.)?doi.org\//.test(doi) ? doi : `https://doi.org/${doi}`,
			isDoi: true,
		};
	}
	const link = str(doc.link) || str(doc.url);
	return link ? { address: link, isDoi: false } : null;
}

export function processPaper(doc: RawDocument, config: MapConfig, s: Strings, _context: MapContext): Paper {
	const text = (field: string, fallback = ""): string => {
		const v = str(doc[field]);
		return v === undefined || v === "" ? fallback : decodeEntities(v);
	};
	const fallback = (key: string) => (typeof s[key] === "string" ? (s[key] as string) : "");

	const id = text("id", fallback("default_id"));
	const authors = parseAuthors(text("authors"));
	let authorsList = authorNames(authors, config.convertAuthorNames);
	let authorsString = authorsList.join(", ");
	if (authorsList.length > 20) {
		const last = authorsList[authorsList.length - 1];
		authorsString = `${authorsList.slice(0, 19).join(", ")}, ... ${last}`;
		authorsList = [...authorsList.slice(0, 20), last];
	}

	const year = text("year");
	const oaState = [0, 1, 2, 3].includes(parseInt(String(doc.oa_state))) ? parseInt(String(doc.oa_state)) : 2;
	const pmcid = text("pmcid");
	const oa = config.service === "pubmed" ? pmcid !== "" : oaState === 1;
	const link = text("link");
	const oaLink =
		config.service === "pubmed" ? (pmcid ? `http://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/` : "") : link;

	let resultType: string[] = [];
	if (Array.isArray(doc.resulttype)) resultType = doc.resulttype.filter((r): r is string => typeof r === "string");
	else if (typeof doc.resulttype === "string") resultType = [doc.resulttype];

	const url = text("url", fallback("default_url"));
	let outlink: string;
	if (config.service === "base") outlink = oaLink;
	else if (config.service === "openaire" && resultType.includes("dataset"))
		outlink = (config.urlPrefixDatasets ?? "") + url;
	else if (config.urlPrefix !== null) outlink = config.urlPrefix + url;
	else outlink = url;

	const comments: Comment[] = Array.isArray(doc.comments)
		? doc.comments.filter(
				(c): c is Comment =>
					!!c && typeof c.comment === "string" && (c.author === undefined || typeof c.author === "string"),
			)
		: [];

	const readersMetric = metric(doc, "readers");
	const readers = readersMetric === "n/a" ? 0 : readersMetric;
	const internalReaders = config.contentBased ? 1 : readers + 1;

	const area = text("area", fallback("default_area"));
	const publishedIn = text("published_in", fallback("default_published_in"));

	return {
		id,
		safeId: safeId(id),
		identifier: text("identifier"),
		title: text("title", fallback("default_paper_title")).trim(),
		authors,
		authorsList,
		authorsString,
		abstract: text("paper_abstract", fallback("default_abstract")),
		year: YEAR.test(year) ? year : fallback("default_year"),
		publishedIn,
		keywords: text("subject_orig", fallback("no_keywords")),
		resultType,
		comments,
		tags: text("tags")
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean),
		doi: text("doi"),
		url,
		oaState,
		oa,
		freeAccess: oaState === 3,
		oaLink,
		outlink,
		listLink: listLink(doc, config),
		relevance: Number(doc.relevance) || 0,
		readers,
		citations: metric(doc, "citation_count"),
		internalReaders,
		areaUri: text("area_uri", area),
		area,
		x: Number(doc.x) || 0,
		y: Number(doc.y) || 0,
		diameter: 0,
		width: 0,
		height: 0,
		place: config.visType === "geomap" ? parsePlace(doc.coverage) : null,
		raw: doc,
	};
}
