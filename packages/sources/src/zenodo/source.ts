/**
 * A Zenodo source: a search on zenodo.org (or another InvenioRDM site),
 * optionally inside one community and of one resource type. The config is
 * plain JSON, so it can be kept in settings, posted to a Web Worker or used
 * by a server.
 *
 *   const result = await searchZenodo({ community: "dryad" }, { q: "coral reef" });
 *   buildOverviewMap({ papers: result.papers, content: result.content, service: "zenodo" }, resources);
 */
import { SourceError } from "../errors.js";
import type { SourceResult } from "../types.js";
import { ZENODO_BASE, ZENODO_REASONS, type ZenodoOptions, zenodoPage } from "./client.js";
import { toZenodoRecord, type ZenodoRecord, zenodoContent } from "./records.js";

/** Sort orders the records search knows. */
export const ZENODO_SORTS = ["bestmatch", "mostrecent", "newest", "oldest", "mostviewed", "mostdownloaded"] as const;
export type ZenodoSort = (typeof ZENODO_SORTS)[number];

/** Resource types (Zenodo's top-level ids) for a form. */
export const ZENODO_TYPES: { value: string; label: string }[] = [
	{ value: "", label: "Any type" },
	{ value: "publication", label: "Publications" },
	{ value: "dataset", label: "Datasets" },
	{ value: "software", label: "Software" },
	{ value: "poster", label: "Posters" },
	{ value: "presentation", label: "Presentations" },
	{ value: "image", label: "Images" },
	{ value: "video", label: "Videos" },
	{ value: "lesson", label: "Lessons" },
	{ value: "physicalobject", label: "Physical objects" },
	{ value: "workflow", label: "Workflows" },
	{ value: "model", label: "Models" },
	{ value: "other", label: "Other" },
];

export interface ZenodoSourceConfig {
	/** The site (default https://zenodo.org; https://sandbox.zenodo.org or any InvenioRDM site work too). */
	baseUrl?: string;
	/** A community's id ("dryad") or its page's URL; only its records are searched. */
	community?: string;
	/** A resource type ("dataset", "publication", ...; see ZENODO_TYPES). */
	type?: string;
	/** A subtype of it ("article", "preprint", ...). */
	subtype?: string;
	/** Added to every search with AND, in Zenodo's search syntax (e.g. `access_status:open`). */
	filter?: string;
	sort?: ZenodoSort;
	/** How many records at most (default 100, at most 1000). */
	limit?: number;
	/**
	 * A personal access token: pages of 100 instead of 25, a higher rate
	 * limit, and the person's restricted records. Kept with the source's
	 * settings in this browser only; never put in a map.
	 */
	accessToken?: string;
}

export interface ZenodoParams {
	/** Search terms in Zenodo's syntax; may be empty when a community is set (its records, newest first). */
	q: string;
	/** Overrides the config's limit. */
	limit?: number;
}

export interface ZenodoSearchOptions extends ZenodoOptions {}

export type ZenodoResult = SourceResult & { papers: ZenodoRecord[]; total: number };

/** Zenodo pages through at most 10,000 results of one search. */
const WINDOW = 10_000;
export const ZENODO_MAX_LIMIT = 1000;

/** "dryad", "https://zenodo.org/communities/dryad/records?q=" → "dryad". */
export function communityId(value: string): string {
	const v = value.trim();
	const m = /\/communities\/([^/?#]+)/.exec(v);
	return decodeURIComponent(m ? m[1] : v).trim();
}

const siteOf = (config: Pick<ZenodoSourceConfig, "baseUrl">) =>
	(config.baseUrl?.trim() || ZENODO_BASE).replace(/\/+$/, "");

/** Problems with a config that make it unusable (for a settings form). */
export function checkZenodoConfig(config: Partial<ZenodoSourceConfig>): string[] {
	const problems: string[] = [];
	try {
		const u = new URL(siteOf(config));
		if (u.protocol !== "https:" && u.protocol !== "http:") problems.push("The site must be an http(s) URL.");
	} catch {
		problems.push("The site must be a URL, such as https://zenodo.org.");
	}
	const c = config.community ? communityId(config.community) : "";
	if (c && !/^[\w.-]+$/.test(c))
		problems.push("The community must be its id (as in zenodo.org/communities/<id>) or its URL.");
	if (config.sort && !ZENODO_SORTS.includes(config.sort)) problems.push(`Unknown sort order "${config.sort}".`);
	if (config.subtype && !config.type) problems.push("A subtype needs a resource type.");
	return problems;
}

/** The search URL for one page. */
export function zenodoSearchUrl(config: ZenodoSourceConfig, q: string, page: number, size: number): string {
	const community = config.community ? communityId(config.community) : "";
	const path = community ? `/api/communities/${encodeURIComponent(community)}/records` : "/api/records";
	const terms = q.trim();
	const filter = config.filter?.trim();
	const query = terms && filter ? `(${terms}) AND (${filter})` : terms || filter || "";
	const sp = new URLSearchParams();
	if (query) sp.set("q", query);
	// Best match means nothing without search terms: then the newest first.
	const sort = config.sort && !(config.sort === "bestmatch" && !query) ? config.sort : query ? "bestmatch" : "newest";
	sp.set("sort", sort);
	sp.set("size", String(size));
	sp.set("page", String(page));
	if (config.type) sp.set("type", config.type);
	if (config.type && config.subtype) sp.set("subtype", config.subtype);
	return `${siteOf(config)}${path}?${sp.toString()}`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(t);
			reject(signal.reason);
		});
	});

/** Runs a search, page by page, and returns map records. */
export async function searchZenodo(
	config: ZenodoSourceConfig,
	params: ZenodoParams,
	opts: ZenodoSearchOptions = {},
): Promise<ZenodoResult> {
	const service = opts.service ?? "zenodo";
	const problems = checkZenodoConfig(config);
	if (problems.length) throw new SourceError(service, problems.join(" "), [ZENODO_REASONS.queryError]);
	if (!params.q.trim() && !config.community && !config.filter?.trim())
		throw new SourceError(service, "Search terms are needed (or a community).", [ZENODO_REASONS.queryError]);
	const token = config.accessToken?.trim() || undefined;
	const limit = Math.max(1, Math.min(params.limit ?? config.limit ?? 100, ZENODO_MAX_LIMIT));
	// Zenodo allows 25 per page without a token, 100 with one.
	const size = Math.min(token ? 100 : 25, limit);
	const maxWait = opts.maxRetryWaitMs ?? 60_000;
	const base = siteOf(config);

	const seen = new Set<string>();
	const papers: ZenodoRecord[] = [];
	let total = 0;
	for (let page = 1; papers.length < limit && (page - 1) * size < WINDOW; page++) {
		const res = await zenodoPage(zenodoSearchUrl(config, params.q, page, size), token, { ...opts, service });
		total = res.total;
		for (const hit of res.hits) {
			const p = toZenodoRecord(hit, base);
			if (seen.has(p.id) || papers.length >= limit) continue;
			seen.add(p.id);
			papers.push(p);
		}
		if (res.hits.length < size || page * size >= total) break;
		// Out of requests for this window: wait for the next one when it is close, else keep what came.
		if (res.remaining === 0 && papers.length < limit) {
			const wait = res.resetAt ? res.resetAt - Date.now() : maxWait + 1;
			if (wait > maxWait) break;
			await sleep(Math.max(0, wait) + 250, opts.signal);
		}
	}
	const content: Record<string, string> = {};
	for (const p of papers) content[p.id] = zenodoContent(p);
	return { service, papers, content, query: params.q, total };
}
