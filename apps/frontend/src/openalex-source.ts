/**
 * OpenAlex sources people set up on the settings page: their own API key
 * and contact address, extra filters, where to search and how many works
 * to fetch. The adaptor itself is @okmaps/sources (openalex/), so it works
 * without this UI too. src/sources.ts registers the type.
 *
 * The API key and address stay in this browser's settings: requests (kept
 * with saved and shared maps) name the source, and the worker gets the
 * secrets beside the request (openalexSecrets).
 */
import { checkOpenalexConfig, type OpenalexSearchIn, type OpenalexSourceConfig } from "@okmaps/sources";
// Types only, so this file (and its tests) need no Svelte.
import type { FieldSpec, FieldValues, SourceInstance, SourceType } from "@okmaps/ui-svelte";
import type { OpenalexRequest } from "./search.ts";

const text = (v: FieldValues, name: string) => String(v[name] ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);

/** What a saved map may keep: the config without the API key and address. */
export type OpenalexPublicConfig = Omit<OpenalexSourceConfig, "apiKey" | "email">;
/** The API key and address of each OpenAlex source, by source instance id. */
export type OpenalexSecrets = Record<string, Pick<OpenalexSourceConfig, "apiKey" | "email">>;

const SEARCH_IN: { value: OpenalexSearchIn; label: string }[] = [
	{ value: "all", label: "Titles, abstracts and full texts" },
	{ value: "title_and_abstract", label: "Titles and abstracts" },
	{ value: "title", label: "Titles only" },
];

const fields: FieldSpec[] = [
	{
		name: "api_key",
		label: "API key",
		kind: "password",
		autocomplete: "off",
		hint: "Free from openalex.org (Settings → API). Without one, everyone on your network shares a small daily budget. It stays in this browser.",
	},
	{
		name: "email",
		label: "Your email",
		kind: "text",
		autocomplete: "email",
		placeholder: "you@example.org",
		hint: "Sent to OpenAlex as a contact, in case they need to reach you.",
	},
	{ name: "search_in", label: "Search in", kind: "select", options: SEARCH_IN, row: "opts" },
	{ name: "limit", label: "Most works", kind: "number", default: "100", row: "opts" },
	{
		name: "filter",
		label: "Extra filters",
		kind: "text",
		code: true,
		placeholder: "is_oa:true,type:article",
		hint: "OpenAlex filters, comma-separated, applied to every search (docs.openalex.org → Filter works).",
		section: "Filters",
	},
];

/** A config as the settings keep it (text only) to the adaptor's, without the secrets. */
export function openalexConfig(c: Record<string, string>): OpenalexPublicConfig {
	const limit = Number.parseInt(c.limit ?? "", 10);
	const searchIn = SEARCH_IN.some((o) => o.value === c.search_in) ? (c.search_in as OpenalexSearchIn) : "all";
	const filter = (c.filter ?? "").trim();
	return {
		searchIn,
		limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 100,
		...(filter ? { filter } : {}),
	};
}

const secretsOf = (c: Record<string, string>) => {
	const apiKey = (c.api_key ?? "").trim();
	const email = (c.email ?? "").trim();
	return { ...(apiKey ? { apiKey } : {}), ...(email ? { email } : {}) };
};

/** The secrets of the person's OpenAlex sources, for the worker. */
export function openalexSecrets(sources: SourceInstance[]): OpenalexSecrets {
	return Object.fromEntries(sources.filter((s) => s.type === "openalex").map((s) => [s.id, secretsOf(s.config)]));
}

export const openalexSourceType: SourceType<OpenalexRequest> = {
	type: "openalex",
	label: "OpenAlex",
	description: "Over 250 million scholarly works from OpenAlex, with your own API key and filters.",
	fields,
	presets: [
		{
			id: "all",
			label: "OpenAlex",
			description: "Every kind of work OpenAlex knows.",
			config: { search_in: "all", limit: "100", filter: "" },
		},
		{
			id: "oa-articles",
			label: "OpenAlex open access articles",
			description: "Journal articles anyone can read.",
			config: { search_in: "title_and_abstract", limit: "100", filter: "is_oa:true,type:article" },
		},
	],
	defaultName: (c) => (c.filter?.trim() ? `OpenAlex (${c.filter.trim()})` : "OpenAlex"),
	check: (c) => checkOpenalexConfig({ ...openalexConfig(c), ...secretsOf(c) }),
	module: (s: SourceInstance) => ({
		description: s.config.filter?.trim() ? `OpenAlex works where ${s.config.filter.trim()}` : "OpenAlex works",
		views: ["overview", "timeline"],
		fields: [
			{ name: "q", label: "Search terms", kind: "search", required: true, placeholder: "e.g. coral bleaching" },
			{ name: "from", label: "From", kind: "date", row: "dates" },
			{ name: "to", label: "To", kind: "date", default: today, row: "dates" },
			{
				name: "sorting",
				label: "Sort by",
				kind: "select",
				row: "dates",
				options: [
					{ value: "most-relevant", label: "Most relevant" },
					{ value: "most-cited", label: "Most cited" },
					{ value: "most-recent", label: "Most recent" },
				],
			},
		],
		request: (v, view) => {
			const sorting = text(v, "sorting");
			return {
				service: "openalex",
				source: s.name,
				sourceId: s.id,
				config: openalexConfig(s.config),
				q: text(v, "q"),
				from: text(v, "from"),
				to: text(v, "to"),
				sorting: sorting === "most-recent" || sorting === "most-cited" ? sorting : "most-relevant",
				...(view === "timeline" ? { vis_type: "timeline" as const } : {}),
			};
		},
		title: (v) => text(v, "q"),
	}),
};
