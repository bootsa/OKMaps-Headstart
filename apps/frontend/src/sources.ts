/**
 * The metadata sources this site offers. Each is an opt-in module
 * (registerSource): the settings page lists them and the search form draws
 * the fields of the enabled ones.
 */
import {
	type FieldSpec,
	type FieldValues,
	registerSource,
	registerSourceType,
	type SourceModule,
	type SourceType,
	text,
} from "@okmaps/ui-svelte";
import { type PlaceSourceConfig, placeSettings } from "./places.ts";
import type { SearchRequest } from "./search.ts";
import { settings } from "./settings.ts";
import { sparqlSourceType } from "./sparql-source.ts";

const today = () => new Date().toISOString().slice(0, 10);

const searchFields = (from: string): FieldSpec[] => [
	{ name: "q", label: "Search terms", kind: "search", required: true, placeholder: "e.g. climate change" },
	{ name: "from", label: "From", kind: "date", required: true, default: from, row: "dates" },
	{ name: "to", label: "To", kind: "date", required: true, default: today, row: "dates" },
	{
		name: "sorting",
		label: "Sort by",
		kind: "select",
		row: "dates",
		options: [
			{ value: "most-relevant", label: "Most relevant" },
			{ value: "most-recent", label: "Most recent" },
		],
	},
];

const common = (v: FieldValues) => ({
	q: text(v, "q"),
	from: text(v, "from"),
	to: text(v, "to"),
	sorting: (text(v, "sorting") === "most-recent" ? "most-recent" : "most-relevant") as "most-relevant" | "most-recent",
});
const timeline = (view: string) => (view === "timeline" ? { vis_type: "timeline" as const } : {});

export const pubmedSource: SourceModule<SearchRequest> = {
	id: "pubmed",
	label: "PubMed",
	description: "Biomedical literature, with citation counts from Crossref.",
	views: ["overview", "timeline"],
	fields: searchFields("1809-01-01"),
	request: (v, view) => ({ service: "pubmed", ...common(v), ...timeline(view) }),
	title: (v) => text(v, "q"),
};

export const baseSource: SourceModule<SearchRequest> = {
	id: "base",
	label: "BASE",
	description: "Bielefeld Academic Search Engine: over 300 million documents from open repositories.",
	views: ["overview", "timeline"],
	fields: [
		...searchFields("1665-01-01"),
		{
			name: "document_types",
			label: "Document types",
			kind: "checkboxes",
			default: ["121"],
			options: [
				{ value: "121", label: "Journal articles" },
				{ value: "11", label: "Books" },
				{ value: "13", label: "Conference objects" },
				{ value: "14", label: "Reports" },
				{ value: "18", label: "Theses" },
				{ value: "7", label: "Datasets" },
			],
		},
	],
	// BASE needs the gateway (registered IP and API key).
	unavailable: () => (settings.gatewayUrl ? undefined : "needs a gateway"),
	request: (v, view) => {
		const types = v.document_types;
		return { service: "base", ...common(v), ...timeline(view), document_types: Array.isArray(types) ? types : [] };
	},
	title: (v) => text(v, "q"),
};

export const openaireSource: SourceModule<SearchRequest> = {
	id: "openaire",
	label: "OpenAIRE project",
	description: "The publications and datasets of one research project.",
	views: ["overview"],
	fields: [
		{ name: "project_id", label: "Grant number", kind: "text", required: true, placeholder: "e.g. 643410", row: "p" },
		{
			name: "funder",
			label: "Funder",
			kind: "select",
			row: "p",
			options: [
				{ value: "EC", label: "European Commission" },
				{ value: "WT", label: "Wellcome Trust" },
				{ value: "NSF", label: "NSF" },
				{ value: "FCT", label: "FCT" },
				{ value: "ARC", label: "ARC" },
				{ value: "NHMRC", label: "NHMRC" },
				{ value: "SNSF", label: "SNSF" },
				{ value: "NWO", label: "NWO" },
			],
		},
	],
	request: (v) => ({ service: "openaire", project_id: text(v, "project_id"), funder: text(v, "funder") }),
	title: (v) => `Project ${text(v, "project_id")} (${text(v, "funder")})`,
};

/** A geo map of every place in a place source; its id is "place:<source id>". */
export function placeModule(p: PlaceSourceConfig): SourceModule<SearchRequest> {
	return {
		id: `place:${p.id}`,
		label: p.label,
		description: "A geo map of every place in this table.",
		views: ["geomap"],
		fields: [
			{
				name: "place_title",
				label: "Map title",
				kind: "text",
				placeholder: p.title ? `e.g. ${p.title}` : undefined,
			},
		],
		request: (v) => ({ service: "places", source: p.id, title: text(v, "place_title") }),
		title: (v) => text(v, "place_title") || p.title || p.label,
	};
}

/** Every source this site offers. */
export function appSources(): SourceModule<SearchRequest>[] {
	return [pubmedSource, baseSource, openaireSource, ...placeSettings().map(placeModule)];
}

/** The site's sources, and the kinds of source people can add themselves (SPARQL). */
export function registerAppSources(): void {
	for (const s of appSources()) registerSource(s);
	registerSourceType(sparqlSourceType as SourceType);
}
