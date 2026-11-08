/**
 * Zotero sources people set up on the settings page: their own library or
 * one of their groups (with an API key), or any public library, optionally
 * one collection. The API key stays in this browser's settings and is never
 * kept with a map. The adaptor itself is @okmaps/sources (zotero/), so it
 * works without this UI too. src/sources.ts registers the type.
 */
import {
	checkZoteroConfig,
	libraryId,
	libraryPath,
	MAX_ZOTERO_ITEMS,
	parseZoteroLibrary,
	SourceError,
	withoutApiKey,
	type ZoteroLibrary,
	type ZoteroSourceConfig,
	zoteroCollections,
	zoteroGet,
	zoteroLibraries,
} from "@okmaps/sources";
// Types only, so this file (and its tests) need no Svelte.
import type { FieldOption, FieldSpec, FieldValues, SourceInstance, SourceType } from "@okmaps/ui-svelte";
import type { SearchRequest, ZoteroRequest } from "./search.ts";

const text = (v: FieldValues | Record<string, string>, name: string) => {
	const x = v[name];
	return (Array.isArray(x) ? x.join(",") : String(x ?? "")).trim();
};

/** The library choice that means "the one typed below". */
const OTHER = "other";
const WHOLE_LIBRARY: FieldOption = { value: "", label: "The whole library" };

/** The library a source's settings name: picked from the list, or typed in. */
export function chosenLibrary(c: FieldValues | Record<string, string>): {
	library?: ZoteroLibrary;
	collection?: string;
} {
	const picked = text(c, "library");
	if (picked && picked !== OTHER) return parseZoteroLibrary(picked) ?? {};
	return parseZoteroLibrary(text(c, "other_library")) ?? {};
}

/** A config as the settings keep it (text only) to the adaptor's. */
export function zoteroConfig(c: Record<string, string>): ZoteroSourceConfig {
	const { library, collection: linked } = chosenLibrary(c);
	const limit = Number.parseInt(c.limit ?? "", 10);
	const collection = (c.collection ?? "").trim() || linked;
	return {
		library: library ? libraryId(library) : "",
		...(collection ? { collection } : {}),
		subcollections: (c.subcollections ?? "").split(",").includes("on"),
		qmode: c.qmode === "everything" ? "everything" : "titleCreatorYear",
		limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_ZOTERO_ITEMS) : 100,
		...(c.api_key?.trim() ? { apiKey: c.api_key.trim() } : {}),
	};
}

async function libraryOptions(v: FieldValues, signal: AbortSignal): Promise<FieldOption[]> {
	const key = text(v, "api_key");
	const other = { value: OTHER, label: key ? "Another library (below)" : "A public library (below)" };
	if (!key) return [other];
	const libraries = await zoteroLibraries(key, { signal });
	return [...libraries.map((l) => ({ value: libraryId(l.library), label: l.name })), other];
}

async function collectionOptions(v: FieldValues, signal: AbortSignal): Promise<FieldOption[]> {
	const { library } = chosenLibrary(v);
	if (!library) return [WHOLE_LIBRARY];
	const list = await zoteroCollections(library, { apiKey: text(v, "api_key"), signal });
	return [WHOLE_LIBRARY, ...list.map((c) => ({ value: c.key, label: `${"   ".repeat(c.depth)}${c.name}` }))];
}

const fields: FieldSpec[] = [
	{
		name: "api_key",
		label: "API key",
		kind: "password",
		autocomplete: "off",
		hint: "Needed for your own library and private groups: make a key with read access at zotero.org/settings/keys. It stays in this browser and is never saved with a map.",
	},
	{
		name: "library",
		label: "Library",
		kind: "select",
		options: [{ value: OTHER, label: "A public library (below)" }],
		loadOptions: libraryOptions,
		dependsOn: ["api_key"],
		hint: "With an API key, your library and your groups are listed here.",
	},
	{
		name: "other_library",
		label: "Public library",
		kind: "text",
		placeholder: "https://www.zotero.org/groups/4846685/pastas",
		hint: "When the library is not in the list: a group's link or ID (the number in zotero.org/groups/<ID>/…), or user:<user ID>. A link to a collection picks that collection.",
	},
	{
		name: "collection",
		label: "Collection",
		kind: "select",
		options: [WHOLE_LIBRARY],
		loadOptions: collectionOptions,
		dependsOn: ["api_key", "library", "other_library"],
	},
	{
		name: "subcollections",
		label: "Subcollections",
		kind: "checkboxes",
		options: [{ value: "on", label: "Also search the collection's subcollections" }],
	},
	{
		name: "qmode",
		label: "Search terms match",
		kind: "select",
		options: [
			{ value: "titleCreatorYear", label: "Titles, authors and years" },
			{ value: "everything", label: "All fields and full texts" },
		],
		row: "opts",
	},
	{ name: "limit", label: "Most items", kind: "number", default: "100", row: "opts" },
];

const describeLibrary = (l?: ZoteroLibrary) =>
	!l ? "Zotero" : l.type === "user" ? `Zotero library ${l.id}` : `Zotero group ${l.id}`;

export const zoteroSourceType: SourceType<ZoteroRequest> = {
	type: "zotero",
	label: "Zotero library",
	description: "Your Zotero library, one of your groups or any public library, or one collection of it.",
	fields,
	defaultName: (c) => describeLibrary(chosenLibrary(c).library),
	async check(c) {
		const config = zoteroConfig(c);
		const problems = checkZoteroConfig(config);
		if (problems.length) return problems;
		// Ask once, so a private library without a key or a wrong ID is never saved.
		const lib = parseZoteroLibrary(String(config.library))?.library as ZoteroLibrary;
		const path = `${libraryPath(lib)}${config.collection ? `/collections/${config.collection}` : ""}/items/top`;
		try {
			await zoteroGet(path, { limit: 1, format: "json" }, { apiKey: config.apiKey });
		} catch (err) {
			if (err instanceof SourceError) return [err.message];
			throw err;
		}
		return [];
	},
	module: (s: SourceInstance) => ({
		description: `Searches ${describeLibrary(chosenLibrary(s.config).library)}`,
		views: ["overview", "timeline"],
		fields: [
			{
				name: "q",
				label: "Search terms",
				kind: "search",
				placeholder: "Leave empty to map every item",
			},
		],
		request: (v, view) => ({
			service: "zotero",
			source: s.name,
			config: zoteroConfig(s.config),
			q: text(v, "q"),
			...(view === "timeline" ? { vis_type: "timeline" as const } : {}),
		}),
		title: (v) => text(v, "q") || s.name,
	}),
};

/** The request as kept with a saved map: without the Zotero API key. */
export function keptRequest(req: SearchRequest): SearchRequest {
	return req.service === "zotero" ? { ...req, config: withoutApiKey(req.config) } : req;
}
