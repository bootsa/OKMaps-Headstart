/** Store types and sources for stories and tests: memory stores, no network. */
import { memoryStorage, treeStore } from "@okmaps/storage";
import type { SourceModule, SourceType, StoreInstance, StoreType } from "../registry";

const memories = new Map<string, ReturnType<typeof memoryStorage>>();

export const memoryStoreType: StoreType = {
	type: "memory",
	label: "Memory",
	description: "Forgotten when the page closes (for trying things out).",
	fields: [],
	folders: true,
	open: async (s: StoreInstance) => {
		let m = memories.get(s.id);
		if (!m) {
			m = memoryStorage();
			memories.set(s.id, m);
		}
		return treeStore({ id: s.id, name: s.name, type: s.type }, m);
	},
};

export const davLikeStoreType: StoreType = {
	type: "dav",
	label: "A WebDAV folder",
	description: "Nextcloud, ownCloud, …",
	fields: [
		{ name: "url", label: "Folder URL", kind: "url", required: true, placeholder: "https://cloud.example.org/okmaps/" },
		{ name: "username", label: "User name", kind: "text", row: "login", autocomplete: "username" },
		{ name: "password", label: "Password", kind: "password", row: "login", autocomplete: "current-password" },
	],
	folders: true,
	defaultName: (c) => (c.url ? new URL(c.url).host : "WebDAV"),
	open: memoryStoreType.open,
	connect: async (s) => {
		if (!s.config.url.startsWith("https://")) throw new Error("the URL must start with https://");
		return s;
	},
};

export const demoSource: SourceModule = {
	id: "demo",
	label: "Demo library",
	description: "Searches a made-up library.",
	views: ["overview", "timeline"],
	fields: [{ name: "q", label: "Search terms", kind: "search", required: true }],
	request: (v, view) => ({ service: "demo", q: v.q, vis_type: view }),
	title: (v) => String(v.q),
};

export const gatewaySource: SourceModule = {
	...demoSource,
	id: "gated",
	label: "Gated library",
	description: "Needs a server.",
	unavailable: () => "needs a gateway",
};

/** A source type people set up themselves: an endpoint and a query, with two presets. */
export const endpointSourceType: SourceType = {
	type: "endpoint",
	label: "A query endpoint",
	description: "Any endpoint that takes a query.",
	fields: [
		{ name: "endpoint", label: "Endpoint", kind: "url", required: true },
		{ name: "query", label: "Query", kind: "textarea", required: true, code: true, lines: 4 },
		{ name: "title", label: "Title variable", kind: "text", placeholder: "title", section: "Field mapping" },
	],
	presets: [
		{
			id: "wiki",
			label: "Wiki",
			description: "Searches the wiki.",
			config: { endpoint: "https://wiki.example/sparql", query: 'SELECT * { "{{q}}" }' },
		},
		{ id: "other", label: "Other wiki", config: { endpoint: "https://other.example/sparql", query: "SELECT {{q}}" } },
	],
	defaultName: (c) => (c.endpoint ? new URL(c.endpoint).host : "Endpoint"),
	check: (c) => (c.query.includes("{{q}}") ? [] : ["The query must use {{q}}."]),
	module: (s) => ({
		description: s.config.endpoint,
		views: ["overview"],
		fields: [{ name: "q", label: "Search terms", kind: "search", required: true }],
		request: (v) => ({ service: "endpoint", q: v.q, config: s.config }),
		title: (v) => String(v.q),
	}),
};
