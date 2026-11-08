/**
 * SPARQL sources people set up on the settings page: any endpoint, a query
 * template and which variables hold which map field. Presets for
 * Wikidata items, Wikidata's scholarly articles and DBpedia. The adaptor
 * itself is @okmaps/sources (sparql/),
 * so it works without this UI too. src/sources.ts registers the type.
 */
import {
	checkSparqlConfig,
	DEFAULT_SPARQL_MAPPING,
	MAPPING_FIELDS,
	SPARQL_PRESETS,
	type SparqlMapping,
	type SparqlSourceConfig,
} from "@okmaps/sources";
// Types only, so this file (and its tests) need no Svelte.
import type { FieldSpec, FieldValues, SourceInstance, SourceType } from "@okmaps/ui-svelte";
import type { SparqlRequest } from "./search.ts";

const text = (v: FieldValues, name: string) => String(v[name] ?? "").trim();

const MAPPING_LABELS: Record<keyof SparqlMapping, string> = {
	id: "Record id",
	title: "Title",
	abstract: "Abstract or description",
	authors: "Authors",
	year: "Year or date",
	url: "Link",
	doi: "DOI",
	subject: "Keywords",
	published_in: "Published in",
};

const mappingKey = (f: keyof SparqlMapping) => `map_${f}`;

const fields: FieldSpec[] = [
	{
		name: "endpoint",
		label: "Endpoint",
		kind: "url",
		required: true,
		placeholder: "https://query.wikidata.org/sparql",
		hint: "The endpoint must allow requests from this site (CORS); Wikidata's and DBpedia's do.",
	},
	{
		name: "query",
		label: "Query",
		kind: "textarea",
		required: true,
		code: true,
		lines: 14,
		hint: "A SELECT query. {{q}} is replaced by the search terms (escaped for a \"…\" string), {{q_words}} by 'word' AND 'word' (Virtuoso full text), {{limit}} and {{lang}} by the values below.",
	},
	{ name: "limit", label: "Most results", kind: "number", default: "100", row: "opts" },
	{ name: "lang", label: "Language", kind: "text", default: "en", placeholder: "en", row: "opts" },
	{
		name: "wikipedia",
		label: "Abstracts",
		kind: "checkboxes",
		options: [{ value: "on", label: "Fill in missing abstracts from the linked Wikipedia articles" }],
	},
	...MAPPING_FIELDS.map(
		(f, i): FieldSpec => ({
			name: mappingKey(f),
			label: MAPPING_LABELS[f],
			kind: "text",
			placeholder: DEFAULT_SPARQL_MAPPING[f],
			section: "Which query variable holds which field",
			row: `map${Math.floor(i / 2)}`,
		}),
	),
];

/** A config as the settings keep it (text only) to the adaptor's. */
export function sparqlConfig(c: Record<string, string>): SparqlSourceConfig {
	const mapping: Partial<Record<keyof SparqlMapping, string>> = {};
	for (const f of MAPPING_FIELDS) if (c[mappingKey(f)]?.trim()) mapping[f] = c[mappingKey(f)].trim();
	const limit = Number.parseInt(c.limit ?? "", 10);
	return {
		endpoint: (c.endpoint ?? "").trim(),
		query: c.query ?? "",
		mapping,
		limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 100,
		lang: (c.lang ?? "").trim() || "en",
		wikipediaIntros: (c.wikipedia ?? "").split(",").includes("on"),
	};
}

/** The adaptor's config as the settings keep it. */
function settingsConfig(c: SparqlSourceConfig): Record<string, string> {
	const out: Record<string, string> = {
		endpoint: c.endpoint,
		query: c.query,
		limit: String(c.limit ?? 100),
		lang: c.lang ?? "en",
		wikipedia: c.wikipediaIntros ? "on" : "",
	};
	for (const f of MAPPING_FIELDS) out[mappingKey(f)] = c.mapping?.[f] ?? "";
	return out;
}

const host = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return "";
	}
};

export const sparqlSourceType: SourceType<SparqlRequest> = {
	type: "sparql",
	label: "SPARQL endpoint",
	description: "Any SPARQL endpoint, such as Wikidata or DBpedia, with a query you can change.",
	fields,
	presets: SPARQL_PRESETS.map((p) => ({
		id: p.id,
		label: p.label,
		description: p.description,
		config: settingsConfig(p.config),
	})),
	defaultName: (c) => host(c.endpoint) || "SPARQL",
	check: (c) => checkSparqlConfig(sparqlConfig(c)),
	module: (s: SourceInstance) => ({
		description: `Asks ${host(s.config.endpoint) || s.config.endpoint}`,
		views: ["overview", "timeline"],
		fields: [{ name: "q", label: "Search terms", kind: "search", required: true, placeholder: "e.g. coral bleaching" }],
		request: (v, view) => ({
			service: "sparql",
			source: s.name,
			config: sparqlConfig(s.config),
			q: text(v, "q"),
			...(view === "timeline" ? { vis_type: "timeline" as const } : {}),
		}),
		title: (v) => text(v, "q"),
	}),
};
