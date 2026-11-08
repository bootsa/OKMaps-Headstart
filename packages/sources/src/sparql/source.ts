/**
 * A SPARQL source: an endpoint, a query template and a mapping of its
 * variables to map fields. The config is plain JSON, so it can be kept in
 * settings, posted to a Web Worker or used by a server.
 *
 *   const result = await searchSparql(sparqlPreset("wikipedia")!.config, { q: "coral bleaching" });
 *   buildOverviewMap({ papers: result.papers, content: result.content, service: "sparql" }, resources);
 */
import { SourceError } from "../errors.js";
import type { SourceResult } from "../types.js";
import { SPARQL_REASONS, type SparqlOptions, sparqlSelect } from "./client.js";
import { type SparqlMapping, type SparqlRecord, sparqlMapping, toSparqlRecords } from "./records.js";
import { fillTemplate, unknownPlaceholders, usesSearchTerms } from "./template.js";
import { addWikipediaIntros } from "./wikipedia.js";

export interface SparqlSourceConfig {
	/** The endpoint URL (SPARQL 1.1 protocol). */
	endpoint: string;
	/** A SELECT query with placeholders ({{q}}, {{limit}}, ...; see template.ts). */
	query: string;
	/** Variable names per field; the defaults are item, title, abstract, authors, year, url, doi, subjects, published_in. */
	mapping?: Partial<Record<keyof SparqlMapping, string>>;
	/** {{limit}} (default 100). */
	limit?: number;
	/** {{lang}} (default "en"). */
	lang?: string;
	/** Fill short or missing abstracts from the linked Wikipedia articles. */
	wikipediaIntros?: boolean;
	method?: SparqlOptions["method"];
}

export interface SparqlParams {
	q: string;
	/** Overrides the config's limit. */
	limit?: number;
}

export interface SparqlSearchOptions extends Omit<SparqlOptions, "service"> {
	/** Name used in errors and the result (default "sparql"). */
	service?: string;
}

export type SparqlResult = SourceResult & { papers: SparqlRecord[] };

/** Problems with a config that make it unusable (for a settings form). */
export function checkSparqlConfig(config: Partial<SparqlSourceConfig>): string[] {
	const problems: string[] = [];
	try {
		const u = new URL(config.endpoint ?? "");
		if (u.protocol !== "https:" && u.protocol !== "http:") problems.push("The endpoint must be an http(s) URL.");
	} catch {
		problems.push("The endpoint must be a URL.");
	}
	const q = config.query ?? "";
	if (!/\bSELECT\b/i.test(q)) problems.push("The query must be a SELECT query.");
	if (!usesSearchTerms(q)) problems.push("The query must use the search terms: {{q}} or {{q_words}}.");
	const unknown = unknownPlaceholders(q);
	if (unknown.length) problems.push(`Unknown placeholders: ${unknown.map((u) => `{{${u}}}`).join(", ")}.`);
	return problems;
}

const contentOf = (p: SparqlRecord) => [p.title, p.paper_abstract, p.subject].filter(Boolean).join(" ");

/** Runs the source's query for a search and returns map records. */
export async function searchSparql(
	config: SparqlSourceConfig,
	params: SparqlParams,
	opts: SparqlSearchOptions = {},
): Promise<SparqlResult> {
	const service = opts.service ?? "sparql";
	const problems = checkSparqlConfig(config);
	if (problems.length) throw new SourceError(service, problems.join(" "), [SPARQL_REASONS.queryError]);
	const query = fillTemplate(config.query, {
		q: params.q,
		limit: params.limit ?? config.limit ?? 100,
		lang: config.lang ?? "en",
	});
	const results = await sparqlSelect(config.endpoint, query, {
		method: config.method,
		...opts,
		service,
	});
	const { papers } = toSparqlRecords(results.rows, sparqlMapping(config.mapping));
	if (papers.length > 0 && papers.every((p) => !p.title))
		throw new SourceError(
			service,
			`No result has a title: map the title to one of the query's variables (${results.vars.join(", ")}).`,
			[SPARQL_REASONS.queryError],
		);
	if (config.wikipediaIntros) await addWikipediaIntros(papers, { fetch: opts.fetch, signal: opts.signal });
	const content: Record<string, string> = {};
	for (const p of papers) content[p.id] = contentOf(p);
	return { service, papers, content, query: params.q };
}
