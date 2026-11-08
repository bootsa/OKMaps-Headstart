/**
 * OpenAlex works as a source of map records: a search, optional filters, an
 * optional API key. Pages through the results with OpenAlex's cursor, waits
 * out short rate limits and turns failures into SourceErrors with reasons
 * the frontend can explain. Runs in browsers (OpenAlex sends CORS *), Web
 * Workers and Node. The config is plain JSON, so settings can keep it.
 *
 *   const result = await searchOpenalex({ apiKey }, { q: "coral bleaching", from: "2015-01-01" });
 *   buildOverviewMap({ papers: result.papers, content: result.content, service: "openalex" }, resources);
 */

import { SourceError } from "../errors.js";
import type { FetchFn } from "../http.js";
import { retryAfterMs } from "../sparql/client.js";
import type { SourceResult } from "../types.js";
import { type OpenalexRecord, type OpenalexWork, toOpenalexRecords } from "./records.js";

export const OPENALEX_BASE = "https://api.openalex.org";

/** Reason codes, explained to people by the frontend (messages.ts). */
export const OPENALEX_REASONS = {
	unreachable: "API error: OpenAlex not reachable",
	rateLimited: "API error: OpenAlex rate limited",
	timeout: "API error: timeout",
	queryError: "OpenAlex query error",
	badResponse: "unexpected OpenAlex response",
} as const;

/** Where the search terms are looked for. */
export type OpenalexSearchIn = "all" | "title_and_abstract" | "title";

export interface OpenalexSourceConfig {
	/** An OpenAlex API key (free; https://openalex.org/settings/api). Without one, requests share the IP's daily budget. */
	apiKey?: string;
	/** A contact address, sent as mailto. */
	email?: string;
	/** Extra filters in OpenAlex syntax, e.g. "is_oa:true,type:article". */
	filter?: string;
	/** "all" (default): title, abstract and full text; or only title and abstract, or only the title. */
	searchIn?: OpenalexSearchIn;
	/** Most works to fetch (default 100, at most 1000). */
	limit?: number;
	/** API base URL (default https://api.openalex.org). */
	baseUrl?: string;
}

export interface OpenalexParams {
	q: string;
	/** Earliest publication date (YYYY-MM-DD or YYYY). */
	from?: string;
	/** Latest publication date (YYYY-MM-DD or YYYY). */
	to?: string;
	sorting?: "most-relevant" | "most-recent" | "most-cited";
	/** Overrides the config's limit. */
	limit?: number;
}

export interface OpenalexOptions {
	fetch?: FetchFn;
	signal?: AbortSignal;
	/** Give up on one page after this long (ms; default 30 s). */
	timeoutMs?: number;
	/** Attempts per page for network errors and 5xx (default 2). */
	attempts?: number;
	/** Wait out a 429 with a Retry-After of at most this long, once per page (ms; default 10 s). */
	maxRetryWaitMs?: number;
	/** Name used in errors and the result (default "openalex"). */
	service?: string;
}

export type OpenalexResult = SourceResult & {
	papers: OpenalexRecord[];
	/** Works matching the search, as OpenAlex counts them. */
	total: number;
	/** Set when a later page failed and the result holds only the pages before it. */
	partial?: string;
};

/** Works per page (OpenAlex allows up to 100). */
const PER_PAGE = 100;
const MAX_LIMIT = 1000;

/** Only the fields the records need: smaller answers. */
export const OPENALEX_SELECT = [
	"id",
	"doi",
	"display_name",
	"publication_year",
	"publication_date",
	"type",
	"language",
	"cited_by_count",
	"abstract_inverted_index",
	"authorships",
	"primary_location",
	"best_oa_location",
	"open_access",
	"primary_topic",
	"topics",
	"keywords",
	"concepts",
].join(",");

const FILTER_PART = /^[a-z_.]+:!?[^,:]+$/i;

/** Problems with a config that make it unusable (for a settings form). */
export function checkOpenalexConfig(config: Partial<OpenalexSourceConfig>): string[] {
	const problems: string[] = [];
	const filter = config.filter?.trim();
	if (filter) {
		const bad = filter.split(",").filter((p) => !FILTER_PART.test(p.trim()));
		if (bad.length) problems.push(`Filters look like "is_oa:true,type:article"; not understood: ${bad.join(", ")}.`);
	}
	if (config.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.email.trim()))
		problems.push("The contact address is not an email address.");
	if (config.apiKey && /\s/.test(config.apiKey.trim())) problems.push("The API key has spaces in it.");
	if (config.baseUrl) {
		try {
			new URL(config.baseUrl);
		} catch {
			problems.push("The API address must be a URL.");
		}
	}
	return problems;
}

/** "2015" → "2015-01-01" (from) or "2015-12-31" (to); dates as they are; "" when unreadable. */
function day(value: string | undefined, end: boolean): string {
	const v = (value ?? "").trim();
	if (/^\d{4}$/.test(v)) return end ? `${v}-12-31` : `${v}-01-01`;
	return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

/** The filter parameter: search field, dates and the config's filters. */
export function openalexFilter(config: OpenalexSourceConfig, params: OpenalexParams): string {
	const parts: string[] = [];
	const searchIn = config.searchIn ?? "all";
	// Commas separate filters, so they can't be in a filter's search terms.
	if (searchIn === "title_and_abstract") parts.push(`title_and_abstract.search:${params.q.replace(/,/g, " ").trim()}`);
	if (searchIn === "title") parts.push(`title.search:${params.q.replace(/,/g, " ").trim()}`);
	const from = day(params.from, false);
	const to = day(params.to, true);
	if (from) parts.push(`from_publication_date:${from}`);
	if (to) parts.push(`to_publication_date:${to}`);
	const extra = config.filter?.trim();
	if (extra) parts.push(...extra.split(",").map((p) => p.trim()));
	return parts.join(",");
}

const SORT = { "most-recent": "publication_date:desc", "most-cited": "cited_by_count:desc" } as const;

/** The URL of one page of works (without the API key when `withKey` is false, for display). */
export function openalexUrl(
	config: OpenalexSourceConfig,
	params: OpenalexParams,
	cursor: string,
	perPage: number,
	withKey = true,
): string {
	const sp = new URLSearchParams();
	if ((config.searchIn ?? "all") === "all") sp.set("search", params.q);
	const filter = openalexFilter(config, params);
	if (filter) sp.set("filter", filter);
	const sort = params.sorting && params.sorting !== "most-relevant" ? SORT[params.sorting] : undefined;
	if (sort) sp.set("sort", sort);
	sp.set("per_page", String(perPage));
	sp.set("cursor", cursor);
	sp.set("select", OPENALEX_SELECT);
	if (config.email?.trim()) sp.set("mailto", config.email.trim());
	// A query parameter, not an Authorization header, so browsers send no CORS preflight.
	if (withKey && config.apiKey?.trim()) sp.set("api_key", config.apiKey.trim());
	return `${(config.baseUrl || OPENALEX_BASE).replace(/\/$/, "")}/works?${sp}`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(t);
			reject(signal.reason);
		});
	});

/** OpenAlex's error answers are JSON: { error, message }. */
function errorText(body: string): string {
	try {
		const j = JSON.parse(body) as { error?: unknown; message?: unknown };
		const parts = [j.error, j.message].filter((s): s is string => typeof s === "string" && s.trim() !== "");
		if (parts.length) return parts.join(": ").slice(0, 500);
	} catch {
		// not JSON
	}
	return body
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 200);
}

interface Page {
	meta?: { count?: number; next_cursor?: string | null };
	results?: OpenalexWork[];
}

async function fetchPage(url: string, config: OpenalexSourceConfig, opts: OpenalexOptions): Promise<Page> {
	const service = opts.service ?? "openalex";
	const doFetch = opts.fetch ?? (globalThis.fetch as FetchFn);
	const attempts = Math.max(1, opts.attempts ?? 2);
	const maxWait = opts.maxRetryWaitMs ?? 10_000;
	let rateRetried = false;
	for (let attempt = 1; ; attempt++) {
		const timeout = new AbortController();
		const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? 30_000);
		const onAbort = () => timeout.abort();
		opts.signal?.addEventListener("abort", onAbort);
		let res: Response;
		let body: string;
		try {
			res = await doFetch(url, { headers: { Accept: "application/json" }, signal: timeout.signal });
			body = await res.text();
		} catch (err) {
			if (opts.signal?.aborted) throw err;
			if (timeout.signal.aborted)
				throw new SourceError(service, "OpenAlex did not answer in time.", [OPENALEX_REASONS.timeout]);
			if (attempt < attempts) {
				await sleep(1000 * attempt, opts.signal);
				continue;
			}
			throw new SourceError(service, `OpenAlex could not be reached: ${err instanceof Error ? err.message : err}`, [
				OPENALEX_REASONS.unreachable,
			]);
		} finally {
			clearTimeout(timer);
			opts.signal?.removeEventListener("abort", onAbort);
		}

		if (res.ok) {
			try {
				const page = JSON.parse(body) as Page;
				if (!Array.isArray(page.results)) throw new Error("no results list");
				return page;
			} catch {
				throw new SourceError(service, `OpenAlex sent an answer this site can't read: ${errorText(body)}`, [
					OPENALEX_REASONS.badResponse,
				]);
			}
		}

		const said = errorText(body);
		if (res.status === 429) {
			const wait = retryAfterMs(res.headers.get("Retry-After"));
			if (!rateRetried && wait !== null && wait <= maxWait) {
				rateRetried = true;
				await sleep(wait, opts.signal);
				continue;
			}
			const hint = config.apiKey?.trim()
				? ""
				: " Without an API key, everyone on your network shares one daily budget: add a free key to this source on the settings page.";
			const when = wait !== null ? ` Try again in ${formatWait(wait)}.` : "";
			throw new SourceError(
				service,
				`OpenAlex gets too many requests from here right now.${when}${hint}`,
				[OPENALEX_REASONS.rateLimited],
				429,
			);
		}
		if (res.status === 401 || res.status === 403)
			throw new SourceError(
				service,
				`OpenAlex refused the request (${res.status}); check the source's API key.${said ? ` (${said})` : ""}`,
				[OPENALEX_REASONS.unreachable],
				res.status,
			);
		if (res.status === 400 || res.status === 404)
			throw new SourceError(service, `OpenAlex could not run the search: ${said || res.status}`, [
				OPENALEX_REASONS.queryError,
			]);
		if (res.status >= 500 && attempt < attempts) {
			await sleep(1000 * attempt, opts.signal);
			continue;
		}
		throw new SourceError(
			service,
			`HTTP failure: ${res.status}${said ? ` ${said}` : ""}`,
			[res.status >= 500 ? OPENALEX_REASONS.unreachable : OPENALEX_REASONS.queryError],
			res.status,
		);
	}
}

function formatWait(ms: number): string {
	const s = Math.ceil(ms / 1000);
	if (s < 120) return `${s} s`;
	if (s < 7200) return `${Math.ceil(s / 60)} minutes`;
	return `${Math.round(s / 3600)} hours`;
}

/** Searches OpenAlex works and returns map records. */
export async function searchOpenalex(
	config: OpenalexSourceConfig,
	params: OpenalexParams,
	opts: OpenalexOptions = {},
): Promise<OpenalexResult> {
	const service = opts.service ?? "openalex";
	const problems = checkOpenalexConfig(config);
	if (problems.length) throw new SourceError(service, problems.join(" "), [OPENALEX_REASONS.queryError]);
	if (!params.q.trim()) throw new SourceError(service, "Search terms are needed.", [OPENALEX_REASONS.queryError]);
	const wanted = Math.max(1, Math.min(MAX_LIMIT, Math.floor(params.limit ?? config.limit ?? 100)));
	const works: OpenalexWork[] = [];
	let cursor: string | null = "*";
	let total = 0;
	let partial: string | undefined;
	while (cursor && works.length < wanted) {
		const perPage = Math.min(PER_PAGE, wanted - works.length);
		let page: Page;
		try {
			page = await fetchPage(openalexUrl(config, params, cursor, perPage), config, opts);
		} catch (err) {
			// Keep the pages we have rather than lose them to a rate limit on a later one.
			if (works.length === 0 || !(err instanceof SourceError)) throw err;
			partial = err.message;
			break;
		}
		total = page.meta?.count ?? total;
		const results = page.results ?? [];
		works.push(...results);
		if (results.length === 0) break;
		cursor = page.meta?.next_cursor ?? null;
	}
	const { papers, content } = toOpenalexRecords(works.slice(0, wanted));
	return {
		service,
		papers,
		content,
		query: params.q,
		total,
		...(partial ? { partial } : {}),
	};
}
