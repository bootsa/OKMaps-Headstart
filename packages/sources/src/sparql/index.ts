/**
 * SPARQL sources: any SPARQL endpoint as a source of map records, with a
 * query template and a mapping of its variables, and presets for Wikipedia
 * (through Wikidata), Wikidata's scholarly articles and DBpedia. No UI
 * code: the app's settings page and a server can use it alike.
 */
export {
	errorSummary,
	retryAfterMs,
	SPARQL_JSON,
	SPARQL_REASONS,
	type SparqlOptions,
	type SparqlResults,
	type SparqlRow,
	type SparqlTerm,
	sparqlSelect,
} from "./client.js";
export {
	DBPEDIA_QUERY,
	SPARQL_PRESETS,
	type SparqlPreset,
	sparqlPreset,
	WIKIDATA_SCHOLARLY_QUERY,
	WIKIPEDIA_QUERY,
} from "./presets.js";
export {
	DEFAULT_SPARQL_MAPPING,
	MAPPING_FIELDS,
	type SparqlMapping,
	type SparqlRecord,
	sparqlMapping,
	toSparqlRecords,
	uriLabel,
	yearOf,
} from "./records.js";
export {
	checkSparqlConfig,
	type SparqlParams,
	type SparqlResult,
	type SparqlSearchOptions,
	type SparqlSourceConfig,
	searchSparql,
} from "./source.js";
export {
	escapeLiteral,
	fillTemplate,
	fullTextWords,
	PLACEHOLDERS,
	type TemplateValues,
	unknownPlaceholders,
	usesSearchTerms,
} from "./template.js";
export { addWikipediaIntros, type WikipediaOptions, wikipediaArticle } from "./wikipedia.js";
