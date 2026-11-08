/**
 * PubMed adaptor, a port of server/preprocessing/other-scripts/pubmed.R.
 *
 * It talks to the NCBI E-utilities directly (they allow cross-origin calls),
 * so it needs no gateway: ESearch with history, then EFetch for the records
 * and ESummary for PMC citation counts and PMC ids.
 */
import { NetworkError, SourceError, toSourceError } from "./errors.js";
import { fetchText, type HttpOptions, queryString } from "./http.js";
import type { SourceRecord, SourceResult } from "./types.js";
import { childElements, findAll, findFirst, parseXml, textOf, type XmlElement } from "./xml.js";

export const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export interface PubmedParams {
	q: string;
	/** Publication date bounds, yyyy-MM-dd. */
	from?: string | null;
	to?: string | null;
	/** Publication types, e.g. "review", "journal article". */
	article_types?: string[] | null;
	sorting?: "most-relevant" | "most-recent" | string | null;
	/** Maximum number of records (the API fixes this at 100). */
	limit?: number;
}

export interface PubmedOptions extends HttpOptions {
	/** NCBI API key: raises the rate limit from 3 to 10 requests per second. */
	apiKey?: string;
	/** Contact address NCBI asks callers to send. */
	email?: string;
	/** Tool name NCBI asks callers to send. */
	tool?: string;
	/** Base URL of the E-utilities, for tests or a proxy. */
	baseUrl?: string;
}

/** Whitespace as R's TRE regex engine sees it (glibc iswspace). */
const WS = "[\\t\\n\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000]";
const TRIM = new RegExp(`^${WS}+|${WS}+$`, "g");

/** R sanitize_query: drop backslashes, turn typographic quotes into ". */
export function sanitizeQuery(q: string): string {
	return q.replace(/\\/g, "").replace(/[“”„]/g, '"');
}

/** The search term pubmed.R sends: query, optional publication types, abstracts only. */
export function buildPubmedTerm(params: Pick<PubmedParams, "q" | "article_types">): string {
	let term = sanitizeQuery(params.q);
	const types = params.article_types ?? [];
	if (types.length > 0) term += ` (("${types.join('"[Publication Type] OR "')}"[Publication Type]))`;
	return term + " AND hasabstract";
}

/** One parsed record, before the per-search fields are added. NA in R is null here. */
export interface PubmedRow {
	title: string | null;
	pmid: string | null;
	published_in: string | null;
	paper_abstract: string | null;
	date: string | null;
	year: string | null;
	/** The DOI (R keeps it in `id` until the end). */
	id: string | null;
	authors: string | null;
	subject: string | null;
	publication_type: string | null;
}

const ARTICLE_FIELDS = [".//ArticleTitle", ".//MedlineCitation/PMID", ".//Title", ".//Abstract"];
const BOOK_FIELDS = [
	".//BookDocument/Book/BookTitle",
	".//BookDocument/PMID",
	".//BookDocument/Book/Publisher/PublisherName",
	".//Abstract",
];
const ARTICLE_YEAR = ".//Article/Journal/JournalIssue/PubDate";
const BOOK_YEAR = ".//BookDocument/Book/PubDate";
const DOI = './/PubmedData/ArticleIdList/ArticleId[@IdType="doi"]';

/** R keeps a field only when the XPath matched exactly once; otherwise NA. */
const single = (values: (string | null)[]): string | null => (values.length === 1 ? values[0] : null);
const texts = (z: XmlElement, path: string) => findAll(z, path).map(textOf);
/** paste() in R prints NA as "NA". */
const rStr = (s: string | null) => (s === null ? "NA" : s);

function parseRecord(z: XmlElement): PubmedRow | null {
	const book = z.name === "PubmedBookArticle";
	if (!book && z.name !== "PubmedArticle") return null;
	const [title, pmid, publishedIn, abstract] = (book ? BOOK_FIELDS : ARTICLE_FIELDS).map((p) => single(texts(z, p)));

	const date = findAll(z, ".//MedlineCitation/DateCreated").flatMap(childElements).map(textOf).join("-");

	const years = findAll(z, book ? BOOK_YEAR : ARTICLE_YEAR).map((a) => {
		const year = findFirst(a, ".//Year");
		if (year) return textOf(year);
		const medline = findFirst(a, ".//MedlineDate");
		return medline ? textOf(medline).slice(0, 4) : null;
	});

	const authors = findAll(z, ".//AuthorList")
		.flatMap(childElements)
		.map((a) => {
			const collective = findFirst(a, ".//CollectiveName");
			if (collective) return textOf(collective);
			const last = findFirst(a, ".//LastName");
			const fore = findFirst(a, ".//ForeName");
			return `${rStr(last && textOf(last))}, ${rStr(fore && textOf(fore))}`;
		})
		.join(";");

	return {
		title,
		pmid,
		published_in: publishedIn,
		paper_abstract: abstract,
		date,
		year: single(years),
		id: single(texts(z, DOI)),
		authors,
		subject: texts(z, ".//Keyword").join("; "),
		publication_type: texts(z, ".//PublicationType").join("; "),
	};
}

/** Parses an EFetch response (PubmedArticleSet) into rows, in response order. */
export function parsePubmedXml(xml: string): PubmedRow[] {
	const root = parseXml(xml);
	const children = childElements(root);
	if (children.length === 1 && textOf(children[0]) === "Empty result - nothing to do") {
		throw new Error("No results retrieved.");
	}
	return children.map(parseRecord).filter((r): r is PubmedRow => r !== null);
}

/** Per-PMID fields from ESummary (JSON, version 2.0). */
export interface PubmedSummary {
	readers: number;
	pmcid: string;
}

export function parseEsummary(json: string): Map<string, PubmedSummary> {
	const result = (JSON.parse(json) as { result?: Record<string, unknown> & { uids?: string[] } }).result ?? {};
	const out = new Map<string, PubmedSummary>();
	for (const uid of result.uids ?? []) {
		const doc = (result[uid] ?? {}) as { pmcrefcount?: unknown; articleids?: { idtype: string; value: string }[] };
		const count = Number(doc.pmcrefcount);
		const pmc = (doc.articleids ?? []).find((a) => a.idtype === "pmc");
		out.set(uid, {
			readers: doc.pmcrefcount === "" || doc.pmcrefcount == null || !Number.isFinite(count) ? 0 : count,
			pmcid: pmc?.value ?? "",
		});
	}
	return out;
}

/** Turns rows into records with the final pubmed.R columns, plus clustering text. */
export function toPubmedRecords(
	rows: PubmedRow[],
	summaries: Map<string, PubmedSummary> = new Map(),
): { papers: SourceRecord[]; content: Record<string, string> } {
	const papers: SourceRecord[] = [];
	const content: Record<string, string> = {};
	for (const r of rows) {
		const abstract = r.paper_abstract === null ? null : r.paper_abstract.replace(/[\r\n]/g, "").replace(TRIM, "");
		const text = [r.title, abstract, r.authors, r.subject, r.published_in].map(rStr).join(" ");
		const id = rStr(r.pmid);
		const summary = summaries.get(id);
		papers.push({
			title: r.title,
			pmid: r.pmid,
			published_in: r.published_in,
			paper_abstract: abstract,
			date: r.date,
			year: r.year,
			id,
			authors: rStr(r.authors),
			subject: r.subject,
			publication_type: r.publication_type,
			url: `http://www.ncbi.nlm.nih.gov/pubmed/${id}`,
			doi: r.id ?? "",
			subject_orig: r.subject,
			readers: summary?.readers ?? 0,
			pmcid: summary?.pmcid ?? "",
		});
		content[id] = text;
	}
	return { papers, content };
}

interface EsearchResult {
	esearchresult?: { count?: string; webenv?: string; querykey?: string; ERROR?: string };
	error?: string;
}

/** Runs a PubMed search and returns records ready for the map pipeline. */
export async function searchPubmed(params: PubmedParams, opts: PubmedOptions = {}): Promise<SourceResult> {
	const base = opts.baseUrl ?? EUTILS_BASE;
	const limit = params.limit ?? 100;
	const common = { tool: opts.tool ?? "okmaps", email: opts.email, api_key: opts.apiKey };
	const term = buildPubmedTerm(params);
	// NCBI allows 3 requests per second without a key, 10 with one.
	const gap = opts.apiKey ? 110 : 350;
	let last = 0;
	const call = async (url: string, init: RequestInit = {}) => {
		const wait = last + gap - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		last = Date.now();
		try {
			return await fetchText(url, init, opts);
		} catch (err) {
			if (err instanceof NetworkError) throw new Error(`PubMed not reachable: ${err.message}`);
			throw err;
		} finally {
			last = Date.now();
		}
	};

	try {
		const search = JSON.parse(
			await call(`${base}/esearch.fcgi`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: queryString({
					db: "pubmed",
					term,
					retmax: limit,
					mindate: params.from ? params.from.replace(/-/g, "/") : null,
					maxdate: params.to ? params.to.replace(/-/g, "/") : null,
					sort: params.sorting === "most-recent" ? null : "relevance",
					usehistory: "y",
					retmode: "json",
					...common,
				}),
			}),
		) as EsearchResult;
		const result = search.esearchresult;
		if (!result || result.ERROR || search.error) {
			throw new Error(`PubMed search failed: ${result?.ERROR ?? search.error ?? "no result"}`);
		}
		if (Number(result.count ?? 0) === 0 || !result.webenv) throw new Error("No results retrieved.");

		const history = { db: "pubmed", WebEnv: result.webenv, query_key: result.querykey, retmax: limit, ...common };
		const xml = await call(`${base}/efetch.fcgi?${queryString({ ...history, rettype: "xml", retmode: "xml" })}`);
		const rows = parsePubmedXml(xml);
		if (rows.length === 0) throw new Error("No results retrieved.");
		const summaries = parseEsummary(
			await call(`${base}/esummary.fcgi?${queryString({ ...history, retmode: "json", version: "2.0" })}`),
		);
		return { service: "pubmed", query: term, ...toPubmedRecords(rows, summaries) };
	} catch (err) {
		if (err instanceof SourceError) throw err;
		throw toSourceError("pubmed", err, params);
	}
}
