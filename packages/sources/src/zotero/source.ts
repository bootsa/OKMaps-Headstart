/**
 * A Zotero source: a personal or group library, optionally one collection
 * (with its subcollections), searched with the Web API's quick search. The
 * config is plain JSON, so it can be kept in settings, posted to a Web
 * Worker or used by a server.
 *
 *   const result = await searchZotero({ library: "group:4846685", collection: "8UG7PVLY" }, { q: "groundwater" });
 *   buildOverviewMap({ papers: result.papers, content: result.content, service: "zotero" }, resources);
 */
import { SourceError } from "../errors.js";
import type { SourceResult } from "../types.js";
import { ZOTERO_REASONS, type ZoteroOptions, zoteroGet } from "./client.js";
import { toZoteroRecords, type ZoteroItem, type ZoteroRecord } from "./records.js";

export interface ZoteroLibrary {
	type: "user" | "group";
	/** The numeric user or group ID. */
	id: string;
}

export interface ZoteroSourceConfig {
	/** The library: { type, id }, or as text ("group:123", "user:45", a zotero.org link, a bare group ID). */
	library: ZoteroLibrary | string;
	/** A collection key; the whole library when missing. */
	collection?: string;
	/** Also search the collection's subcollections. */
	subcollections?: boolean;
	/** What the search terms are matched against (default titles, creators and years). */
	qmode?: "titleCreatorYear" | "everything";
	/** Most items to take (default 100, at most 1000). */
	limit?: number;
	/** Read access to private libraries. Leave it out of anything shared or saved with a map. */
	apiKey?: string;
}

export interface ZoteroParams {
	/** Search terms; empty takes every item (of the collection). */
	q?: string;
	/** Overrides the config's limit. */
	limit?: number;
}

export type ZoteroSearchOptions = Omit<ZoteroOptions, "apiKey">;

export type ZoteroResult = SourceResult & { papers: ZoteroRecord[]; total: number };

export const MAX_ZOTERO_ITEMS = 1000;
const PAGE = 100;

const libraryOf = (type: string, id: string): ZoteroLibrary => ({
	type: type.startsWith("user") ? "user" : "group",
	id,
});

/**
 * Reads a library (and a collection, when the text names one) from what
 * people paste: "group:123", "user:45", "groups/123", a bare group ID, or a
 * link to a library or collection on www.zotero.org or api.zotero.org.
 * Returns null when it names no library by number (zotero.org/groups/name
 * links name the group, which the API cannot look up).
 */
export function parseZoteroLibrary(text: string): { library: ZoteroLibrary; collection?: string } | null {
	const s = text.trim();
	if (!s) return null;
	let m = /^(user|group)s?[:/](\d+)$/i.exec(s);
	if (m) return { library: libraryOf(m[1].toLowerCase(), m[2]) };
	if (/^\d+$/.test(s)) return { library: { type: "group", id: s } };
	let url: URL;
	try {
		url = new URL(s);
	} catch {
		return null;
	}
	if (!/(^|\.)zotero\.org$/.test(url.hostname)) return null;
	const path = url.pathname.replace(/\/+$/, "");
	m = /^\/(users|groups)\/(\d+)(?:\/|$)/.exec(`${path}/`);
	if (!m) return null;
	const collection = /\/collections\/([A-Z0-9]{8})(?:\/|$)/.exec(`${path}/`)?.[1];
	return { library: libraryOf(m[1], m[2]), ...(collection ? { collection } : {}) };
}

/** "group:123" for a library (as the settings keep it). */
export const libraryId = (l: ZoteroLibrary) => `${l.type}:${l.id}`;

/** The API path of a library: /users/45 or /groups/123. */
export const libraryPath = (l: ZoteroLibrary) => `/${l.type === "user" ? "users" : "groups"}/${l.id}`;

function resolveLibrary(library: ZoteroSourceConfig["library"]): ZoteroLibrary | null {
	if (typeof library === "object" && library && /^\d+$/.test(library.id)) return library;
	if (typeof library === "string") return parseZoteroLibrary(library)?.library ?? null;
	return null;
}

/** Problems with a config that make it unusable (for a settings form). */
export function checkZoteroConfig(config: Partial<ZoteroSourceConfig>): string[] {
	const problems: string[] = [];
	if (!resolveLibrary(config.library ?? ""))
		problems.push(
			"Name a library: a group ID (the number in the group's link), user:<your user ID>, or a link to a library or collection on zotero.org.",
		);
	if (config.collection && !/^[A-Z0-9]{8}$/.test(config.collection))
		problems.push("A collection key is 8 letters and digits (as in …/collections/ABCD1234).");
	return problems;
}

/** The config without its API key, to keep with a map or share. */
export function withoutApiKey(config: ZoteroSourceConfig): ZoteroSourceConfig {
	const { apiKey: _key, ...rest } = config;
	return rest;
}

/** What an API key may read, from /keys/current. */
export interface ZoteroKeyInfo {
	userID: number;
	username: string;
	/** Whether it can read the person's own library. */
	userLibrary: boolean;
}

export async function zoteroKeyInfo(apiKey: string, opts: ZoteroSearchOptions = {}): Promise<ZoteroKeyInfo> {
	const { data } = await zoteroGet<{
		userID?: number;
		username?: string;
		access?: { user?: { library?: boolean } };
	}>("/keys/current", {}, { ...opts, apiKey });
	if (typeof data.userID !== "number")
		throw new SourceError(opts.service ?? "zotero", "Zotero did not say whose key this is.", [
			ZOTERO_REASONS.badResponse,
		]);
	return { userID: data.userID, username: data.username ?? "", userLibrary: data.access?.user?.library !== false };
}

/** Every page of a list (collections, groups), up to `max` entries. */
async function allPages<T>(
	path: string,
	params: Record<string, string | number | undefined>,
	opts: ZoteroOptions,
	max = 2000,
): Promise<T[]> {
	const out: T[] = [];
	for (let start = 0; out.length < max; ) {
		const { data, next } = await zoteroGet<T[]>(path, { ...params, limit: PAGE, start }, opts);
		if (!Array.isArray(data))
			throw new SourceError(opts.service ?? "zotero", "Zotero's answer is not a list.", [ZOTERO_REASONS.badResponse]);
		out.push(...data);
		if (!next || data.length === 0) break;
		start += data.length;
	}
	return out.slice(0, max);
}

export interface ZoteroLibraryChoice {
	library: ZoteroLibrary;
	name: string;
}

/** The libraries an API key can read: the person's own and their groups. */
export async function zoteroLibraries(apiKey: string, opts: ZoteroSearchOptions = {}): Promise<ZoteroLibraryChoice[]> {
	const key = await zoteroKeyInfo(apiKey, opts);
	const groups = await allPages<{ id: number; data?: { name?: string } }>(
		`/users/${key.userID}/groups`,
		{},
		{ ...opts, apiKey },
	);
	const own: ZoteroLibraryChoice[] = key.userLibrary
		? [
				{
					library: { type: "user", id: String(key.userID) },
					name: key.username ? `My library (${key.username})` : "My library",
				},
			]
		: [];
	return [
		...own,
		...groups.map((g) => ({
			library: { type: "group" as const, id: String(g.id) },
			name: g.data?.name ?? `Group ${g.id}`,
		})),
	];
}

export interface ZoteroCollection {
	key: string;
	name: string;
	/** The parent collection's key, or null at the top. */
	parent: string | null;
	/** Names from the top, "Parent / Child". */
	path: string;
	/** 0 at the top. */
	depth: number;
	/** Items directly in it. */
	numItems: number;
}

/** A library's collections, as a tree in reading order (parents before their children, by name). */
export async function zoteroCollections(
	library: ZoteroLibrary | string,
	opts: ZoteroOptions = {},
): Promise<ZoteroCollection[]> {
	const lib = resolveLibrary(library);
	if (!lib) throw new SourceError(opts.service ?? "zotero", "No such library.", [ZOTERO_REASONS.notFound]);
	const raw = await allPages<{
		key: string;
		data?: { name?: string; parentCollection?: string | false };
		meta?: { numItems?: number };
	}>(`${libraryPath(lib)}/collections`, {}, opts);
	const byParent = new Map<string | null, typeof raw>();
	for (const c of raw) {
		const p = c.data?.parentCollection || null;
		byParent.set(p, [...(byParent.get(p) ?? []), c]);
	}
	const out: ZoteroCollection[] = [];
	const known = new Set(raw.map((c) => c.key));
	const walk = (parent: string | null, path: string[], depth: number) => {
		const children = [...(byParent.get(parent) ?? [])].sort((a, b) =>
			(a.data?.name ?? "").localeCompare(b.data?.name ?? "", undefined, { numeric: true }),
		);
		for (const c of children) {
			const name = c.data?.name ?? c.key;
			out.push({
				key: c.key,
				name,
				parent,
				path: [...path, name].join(" / "),
				depth,
				numItems: c.meta?.numItems ?? 0,
			});
			walk(c.key, [...path, name], depth + 1);
		}
	};
	walk(null, [], 0);
	// Collections whose parent is not in the list (should not happen) at the end.
	for (const [p, list] of byParent)
		if (p !== null && !known.has(p))
			for (const c of list)
				out.push({
					key: c.key,
					name: c.data?.name ?? c.key,
					parent: p,
					path: c.data?.name ?? c.key,
					depth: 0,
					numItems: c.meta?.numItems ?? 0,
				});
	return out;
}

/** A collection and every collection below it. */
export function withSubcollections(key: string, collections: ZoteroCollection[]): string[] {
	const out = [key];
	for (let i = 0; i < out.length; i++)
		for (const c of collections) if (c.parent === out[i] && !out.includes(c.key)) out.push(c.key);
	return out;
}

const contentOf = (p: ZoteroRecord) => [p.title, p.paper_abstract, p.subject].filter(Boolean).join(" ");

/** Searches the library (or collection) and returns map records. */
export async function searchZotero(
	config: ZoteroSourceConfig,
	params: ZoteroParams = {},
	opts: ZoteroSearchOptions = {},
): Promise<ZoteroResult> {
	const service = opts.service ?? "zotero";
	const problems = checkZoteroConfig(config);
	if (problems.length) throw new SourceError(service, problems.join(" "), [ZOTERO_REASONS.notFound]);
	const lib = resolveLibrary(config.library) as ZoteroLibrary;
	const http: ZoteroOptions = { ...opts, service, apiKey: config.apiKey };
	const limit = Math.max(1, Math.min(MAX_ZOTERO_ITEMS, params.limit ?? config.limit ?? 100));
	const q = (params.q ?? "").trim();

	const collections = config.collection
		? config.subcollections
			? withSubcollections(config.collection, await zoteroCollections(lib, http))
			: [config.collection]
		: [null];

	const items: ZoteroItem[] = [];
	const seen = new Set<string>();
	let total = 0;
	for (const collection of collections) {
		const path = `${libraryPath(lib)}${collection ? `/collections/${collection}` : ""}/items/top`;
		for (let start = 0; items.length < limit; ) {
			const page = await zoteroGet<ZoteroItem[]>(
				path,
				{
					format: "json",
					q: q || undefined,
					qmode: q ? (config.qmode ?? "titleCreatorYear") : undefined,
					// Notes and attachments are no documents; leave them out up front.
					itemType: "-attachment",
					limit: Math.min(PAGE, limit - items.length),
					start,
				},
				http,
			);
			if (!Array.isArray(page.data))
				throw new SourceError(service, "Zotero's answer is not a list of items.", [ZOTERO_REASONS.badResponse]);
			if (start === 0) total += page.total ?? page.data.length;
			for (const it of page.data)
				if (it?.key && !seen.has(it.key) && it.data?.itemType !== "note") {
					seen.add(it.key);
					items.push(it);
				}
			if (!page.next || page.data.length === 0) break;
			start += page.data.length;
		}
		if (items.length >= limit) break;
	}

	const { papers } = toZoteroRecords(items.slice(0, limit));
	const content: Record<string, string> = {};
	for (const p of papers) content[p.id] = contentOf(p);
	return { service, papers, content, query: q, total };
}
