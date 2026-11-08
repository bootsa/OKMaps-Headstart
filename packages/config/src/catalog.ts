/**
 * What a build can choose from, with labels for the wizard and the web
 * configurator. The ids are the ones apps/frontend's module catalog maps to
 * code (apps/frontend/okmaps.catalog.ts).
 */
import type { Features, PluginId, SkinId, SourceId, SourceTypeId, StoreTypeId, ViewId } from "./types.ts";

export interface Choice<Id extends string = string> {
	id: Id;
	label: string;
	description: string;
}

export const SOURCES: Choice<SourceId>[] = [
	{ id: "pubmed", label: "PubMed", description: "Biomedical literature, with citation counts from Crossref." },
	{ id: "base", label: "BASE", description: "Over 300 million documents from open repositories (needs a gateway)." },
	{ id: "openaire", label: "OpenAIRE project", description: "The publications and datasets of one research project." },
	{ id: "places", label: "Place tables", description: "A geo map of every place in a table (default: AQUANAVI)." },
];

export const SOURCE_TYPES: Choice<SourceTypeId>[] = [
	{ id: "sparql", label: "SPARQL endpoint", description: "Wikidata, DBpedia or any SPARQL endpoint." },
	{ id: "zenodo", label: "Zenodo", description: "Zenodo records, a community or a search." },
	{ id: "zotero", label: "Zotero", description: "A Zotero library, group or collection." },
	{ id: "openalex", label: "OpenAlex", description: "OpenAlex works with own filters and API key." },
];

export const STORE_TYPES: Choice<StoreTypeId>[] = [
	{ id: "browser", label: "This browser", description: "IndexedDB: works offline, nothing leaves the device." },
	{ id: "webdav", label: "WebDAV folder", description: "Nextcloud, ownCloud and other WebDAV servers." },
	{ id: "solid", label: "Solid Pod", description: "A folder in a Solid Pod (login at the identity provider)." },
	{ id: "atomic", label: "Atomic Data server", description: "A Drive or Folder on an atomic-server." },
];

export const VIEWS: Choice<ViewId>[] = [
	{ id: "overview", label: "Knowledge map", description: "The main areas of a topic." },
	{ id: "timeline", label: "Streamgraph", description: "How a topic's keywords changed over time." },
	{ id: "geomap", label: "Geo map", description: "Places on a map (Leaflet); needs place tables." },
];

export const PLUGINS: Choice<PluginId>[] = [
	{ id: "info", label: "About this map", description: "The map's information page." },
	{ id: "cite-map", label: "Cite the map", description: "A citation for the whole map." },
	{ id: "pdf", label: "PDF preview", description: "Opens a paper's PDF where there is one." },
	{ id: "cite-paper", label: "Cite a paper", description: "Citations in several styles for each paper." },
	{ id: "export-paper", label: "Export a paper", description: "BibTeX and RIS for each paper." },
];

export const FEATURES: Choice<keyof Features>[] = [
	{ id: "settingsPage", label: "Settings page", description: "The settings page and the links to it." },
	{ id: "chooseSources", label: "Choose sources", description: "Switch the site's sources on and off." },
	{ id: "addSources", label: "Add own sources", description: "Add sources of the offered kinds." },
	{ id: "addStores", label: "Manage stores", description: "Add, change and remove where maps are kept." },
	{ id: "explorer", label: "My maps drawer", description: "The drawer with saved maps on the start page." },
	{ id: "saveChoice", label: "Choose where to save", description: '"Keep the map in" in the search form.' },
	{ id: "combine", label: "Several sources", description: "One map from several sources at once." },
	{ id: "share", label: "Share and embed", description: "Share and Embed buttons (need a gateway)." },
	{ id: "schemeToggle", label: "Light/dark switch", description: "The switch between light and dark." },
	{ id: "offline", label: "Works offline", description: "A service worker keeps the site for offline use." },
	{ id: "versionLink", label: "Version line", description: '"Version … · other versions" on the start page.' },
];

export const SKINS: Choice<SkinId>[] = [
	{ id: "viper", label: "Viper", description: "Grey lines and quiet surfaces." },
	{ id: "cris_vis", label: "CRIS", description: "PT Sans, dark blue." },
	{ id: "linkedcat", label: "LinkedCat", description: "Lato, blue links." },
	{ id: "covis", label: "CoVis", description: "Lato, teal." },
];

/** Config fields that hold secrets, by source or store type. */
export const SECRET_FIELDS: Record<string, string[]> = {
	zotero: ["api_key"],
	zenodo: ["token"],
	openalex: ["api_key", "email"],
	webdav: ["password"],
	atomic: ["secret"],
};

/** A config field of a source or store type, for the wizard and the web configurator. */
export interface ConfigField {
	name: string;
	label: string;
	hint?: string;
	required?: boolean;
}

/**
 * The main config fields of each source and store type (the settings page
 * has them all; any of its field names can go in a preset's config).
 */
export const TYPE_FIELDS: Record<SourceTypeId | StoreTypeId, ConfigField[]> = {
	sparql: [
		{ name: "endpoint", label: "Endpoint URL", required: true, hint: "e.g. https://query.wikidata.org/sparql" },
		{ name: "query", label: "Query (empty: the default query)" },
		{ name: "limit", label: "Most results", hint: "100" },
		{ name: "lang", label: "Language", hint: "en" },
	],
	zenodo: [
		{ name: "community", label: "Community id", hint: "e.g. aquacosm" },
		{ name: "filter", label: "Extra filter (Zenodo search syntax)" },
		{ name: "limit", label: "Most results", hint: "100" },
		{ name: "token", label: "Access token (secret)" },
	],
	zotero: [
		{ name: "other_library", label: "Library", required: true, hint: "groups/<id> or users/<id>" },
		{ name: "collection", label: "Collection key (empty: the whole library)" },
		{ name: "limit", label: "Most items", hint: "100" },
		{ name: "api_key", label: "API key (secret; only for private libraries)" },
	],
	openalex: [
		{
			name: "filter",
			label: "Filter (OpenAlex filter syntax)",
			hint: "e.g. institutions.ror:https://ror.org/01hcx6992",
		},
		{ name: "limit", label: "Most works", hint: "100" },
		{ name: "api_key", label: "API key (secret)" },
		{ name: "email", label: "Contact address (secret)" },
	],
	browser: [],
	webdav: [
		{ name: "url", label: "Folder URL", required: true },
		{ name: "username", label: "User name" },
		{ name: "password", label: "Password (secret)" },
	],
	solid: [
		{ name: "issuer", label: "Identity provider", required: true, hint: "e.g. https://login.inrupt.com" },
		{ name: "container", label: "Folder in the Pod (empty: okmaps/)" },
	],
	atomic: [
		{ name: "parent", label: "Folder or Drive URL", required: true },
		{ name: "secret", label: "Agent secret (secret)", required: true },
	],
};
