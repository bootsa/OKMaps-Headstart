/**
 * Zenodo sources people set up on the settings page: all of Zenodo or one
 * community, optionally one resource type, with an optional personal
 * access token. The adaptor itself is @okmaps/sources (zenodo/), so it
 * works without this UI too. src/sources.ts registers the type.
 */
import {
	checkZenodoConfig,
	communityId,
	ZENODO_BASE,
	ZENODO_MAX_LIMIT,
	ZENODO_SORTS,
	ZENODO_TYPES,
	type ZenodoSort,
	type ZenodoSourceConfig,
} from "@okmaps/sources";
// Types only, so this file (and its tests) need no Svelte.
import type { FieldSpec, FieldValues, SourceInstance, SourceType } from "@okmaps/ui-svelte";
import type { SearchRequest, ZenodoRequest } from "./search.ts";

const text = (v: FieldValues, name: string) => String(v[name] ?? "").trim();

const SORT_LABELS: Record<ZenodoSort, string> = {
	bestmatch: "Best match",
	mostrecent: "Most recent",
	newest: "Newest",
	oldest: "Oldest",
	mostviewed: "Most viewed",
	mostdownloaded: "Most downloaded",
};

const fields: FieldSpec[] = [
	{
		name: "community",
		label: "Community",
		kind: "text",
		placeholder: "e.g. dryad, or https://zenodo.org/communities/dryad",
		hint: "Only search one community's records. Leave it empty to search all of Zenodo.",
	},
	{ name: "type", label: "Resource type", kind: "select", options: ZENODO_TYPES, row: "type" },
	{
		name: "subtype",
		label: "Subtype",
		kind: "text",
		placeholder: "e.g. article, preprint",
		row: "type",
	},
	{
		name: "sort",
		label: "Order",
		kind: "select",
		options: ZENODO_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] })),
		row: "opts",
	},
	{ name: "limit", label: "Most results", kind: "number", default: "100", row: "opts" },
	{
		name: "token",
		label: "Access token",
		kind: "password",
		autocomplete: "off",
		hint: "Optional: a personal access token (zenodo.org → Applications) gives faster searches (100 records per request instead of 25), a higher rate limit and your restricted records. It stays in this browser and is never saved with a map.",
	},
	{
		name: "filter",
		label: "Extra filter",
		kind: "text",
		placeholder: "e.g. access_status:open",
		hint: "Added to every search with AND, in Zenodo's search syntax.",
		section: "More",
	},
	{
		name: "site",
		label: "Site",
		kind: "url",
		placeholder: ZENODO_BASE,
		hint: "Another InvenioRDM site, such as https://sandbox.zenodo.org.",
		section: "More",
	},
];

/** A config as the settings keep it (text only) to the adaptor's. */
export function zenodoConfig(c: Record<string, string>): ZenodoSourceConfig {
	const limit = Number.parseInt(c.limit ?? "", 10);
	const sort = (c.sort ?? "").trim() as ZenodoSort;
	const out: ZenodoSourceConfig = {
		limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, ZENODO_MAX_LIMIT) : 100,
	};
	const set = <K extends keyof ZenodoSourceConfig>(k: K, v: string | undefined) => {
		const t = v?.trim();
		if (t) out[k] = t as ZenodoSourceConfig[K];
	};
	set("baseUrl", c.site);
	set("community", c.community ? communityId(c.community) : "");
	set("type", c.type);
	if (out.type) set("subtype", c.subtype);
	set("filter", c.filter);
	if (ZENODO_SORTS.includes(sort)) out.sort = sort;
	set("accessToken", c.token);
	return out;
}

/** The request as it is kept with a map: without the access token. */
export function withoutToken(req: SearchRequest): SearchRequest {
	if (req.service !== "zenodo" || !req.config.accessToken) return req;
	const { accessToken: _, ...config } = req.config;
	return { ...req, config };
}

const siteName = (c: Record<string, string>) => {
	try {
		return new URL(c.site?.trim() || ZENODO_BASE).host;
	} catch {
		return "zenodo.org";
	}
};

const where = (c: Record<string, string>) => {
	const community = c.community ? communityId(c.community) : "";
	return community ? `the ${community} community on ${siteName(c)}` : siteName(c);
};

export const zenodoSourceType: SourceType<ZenodoRequest> = {
	type: "zenodo",
	label: "Zenodo",
	description:
		"Records on Zenodo (publications, datasets, software, ...): all of them or one community's, of one type if you like.",
	fields,
	defaultName: (c) => {
		const community = c.community ? communityId(c.community) : "";
		const type = ZENODO_TYPES.find((t) => t.value && t.value === c.type?.trim())?.label;
		return [community ? `Zenodo: ${community}` : "Zenodo", type].filter(Boolean).join(", ");
	},
	check: (c) => {
		const problems = checkZenodoConfig(zenodoConfig(c));
		if (c.token?.trim() && /\s/.test(c.token.trim())) problems.push("The access token must not contain spaces.");
		return problems;
	},
	module: (s: SourceInstance) => {
		const community = !!s.config.community?.trim();
		return {
			description: `Searches ${where(s.config)}`,
			views: ["overview", "timeline"],
			fields: [
				{
					name: "q",
					label: "Search terms",
					kind: "search",
					required: !community,
					placeholder: community ? "Leave empty for the community's newest records" : "e.g. coral bleaching",
				},
			],
			request: (v, view) => ({
				service: "zenodo",
				source: s.name,
				config: zenodoConfig(s.config),
				q: text(v, "q"),
				...(view === "timeline" ? { vis_type: "timeline" as const } : {}),
			}),
			title: (v) => text(v, "q") || s.name,
		};
	},
};
