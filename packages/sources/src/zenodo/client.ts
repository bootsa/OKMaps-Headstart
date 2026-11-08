/**
 * A small client for the Zenodo REST API's record search (and any other
 * InvenioRDM site, which has the same API), for browsers, Web Workers and
 * Node. Zenodo sends CORS headers for every origin, so no gateway is needed.
 * Failures (unreachable, rate limits, a bad query, an unknown community,
 * a refused token) become SourceErrors with reason codes the frontend can
 * explain.
 */
import { SourceError } from "../errors.js";
import type { FetchFn } from "../http.js";

export const ZENODO_BASE = "https://zenodo.org";

/** Reason codes, explained to people by the frontend (messages.ts). */
export const ZENODO_REASONS = {
	unreachable: "API error: Zenodo not reachable",
	rateLimited: "API error: Zenodo rate limited",
	timeout: "API error: timeout",
	queryError: "Zenodo query error",
	notFound: "Zenodo community not found",
	tokenRefused: "Zenodo access token refused",
	badResponse: "unexpected Zenodo response",
} as const;

/** One search hit as Zenodo returns it (only the fields read here). */
export interface ZenodoHit {
	id: number | string;
	doi?: string;
	doi_url?: string;
	metadata?: {
		title?: string;
		description?: string;
		publication_date?: string;
		doi?: string;
		creators?: { name?: string; affiliation?: string; orcid?: string }[];
		keywords?: string[];
		subjects?: { term?: string; subject?: string }[];
		resource_type?: { title?: string; type?: string; subtype?: string };
		access_right?: string;
		journal?: { title?: string };
		imprint?: { publisher?: string };
		meeting?: { title?: string };
		communities?: { id?: string }[];
		publisher?: string;
	};
	links?: { self_html?: string; html?: string; doi?: string };
	stats?: { downloads?: number; views?: number; unique_downloads?: number; unique_views?: number };
}

export interface ZenodoPage {
	hits: ZenodoHit[];
	total: number;
	/** Requests left in the current rate-limit window, when the site says. */
	remaining?: number;
	/** When the window ends (ms since 1970), when the site says. */
	resetAt?: number;
}

export interface ZenodoOptions {
	fetch?: FetchFn;
	signal?: AbortSignal;
	/** Give up on a request after this long (ms; default 30 s). */
	timeoutMs?: number;
	/** Attempts for network errors and 5xx (default 2). */
	attempts?: number;
	/**
	 * When Zenodo says "too many requests" (or no requests are left in the
	 * window and more pages are needed), wait at most this long and go on
	 * (ms; default 60 s, Zenodo's window). Longer waits fail with the time to
	 * wait in the message.
	 */
	maxRetryWaitMs?: number;
	/** Name used in errors (default "zenodo"). */
	service?: string;
	/**
	 * Extra request headers. Outside a browser, Zenodo may block requests
	 * without a User-Agent ("unusual traffic"); browsers send their own.
	 */
	headers?: Record<string, string>;
}

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (ms <= 0) return resolve();
		const t = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(t);
			reject(signal.reason);
		});
	});

/** How long to wait before asking again: Retry-After, else X-RateLimit-Reset, else null. */
export function zenodoRetryMs(headers: Headers, now = Date.now()): number | null {
	const after = headers.get("retry-after")?.trim();
	if (after && /^\d+$/.test(after)) return Number(after) * 1000;
	if (after) {
		const t = Date.parse(after);
		if (Number.isFinite(t)) return Math.max(0, t - now);
	}
	const reset = Number(headers.get("x-ratelimit-reset"));
	return Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - now) : null;
}

/** The message of an InvenioRDM error body ({"status", "message", "errors": [{field, messages}]}). */
export function zenodoErrorMessage(body: string): string {
	try {
		const j = JSON.parse(body) as { message?: unknown; errors?: { field?: string; messages?: unknown[] }[] };
		const details = (j.errors ?? [])
			.flatMap((e) => (Array.isArray(e.messages) ? e.messages : []).map((m) => String(m)))
			.filter(Boolean);
		const message = typeof j.message === "string" ? j.message : "";
		return [message, ...details].filter(Boolean).join(" ").slice(0, 300);
	} catch {
		return body
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 200);
	}
}

const seconds = (ms: number) => Math.ceil(ms / 1000);

/**
 * Fetches one page of search results. `url` is the full search URL
 * (…/api/records?… or …/api/communities/<slug>/records?…).
 */
export async function zenodoPage(
	url: string,
	token: string | undefined,
	opts: ZenodoOptions = {},
): Promise<ZenodoPage> {
	const service = opts.service ?? "zenodo";
	const doFetch = opts.fetch ?? (globalThis.fetch as FetchFn);
	const attempts = Math.max(1, opts.attempts ?? 2);
	const maxWait = opts.maxRetryWaitMs ?? 60_000;
	// A token goes in the Authorization header: Zenodo allows it in CORS
	// preflights, and it stays out of URLs (logs, caches, the map's params).
	const headers: Record<string, string> = { ...opts.headers, Accept: "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	let rateRetried = false;

	for (let attempt = 1; ; attempt++) {
		const timeout = new AbortController();
		const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? 30_000);
		const onAbort = () => timeout.abort();
		opts.signal?.addEventListener("abort", onAbort);
		let res: Response;
		let body: string;
		try {
			res = await doFetch(url, { headers, signal: timeout.signal });
			body = await res.text();
		} catch (err) {
			if (opts.signal?.aborted) throw err;
			if (timeout.signal.aborted)
				throw new SourceError(service, "Zenodo did not answer in time.", [ZENODO_REASONS.timeout]);
			if (attempt < attempts) {
				await sleep(1000 * attempt, opts.signal);
				continue;
			}
			throw new SourceError(
				service,
				`${new URL(url).host} could not be reached, or it does not allow this site (CORS): ${err instanceof Error ? err.message : err}`,
				[ZENODO_REASONS.unreachable],
			);
		} finally {
			clearTimeout(timer);
			opts.signal?.removeEventListener("abort", onAbort);
		}

		if (res.status === 429) {
			const wait = zenodoRetryMs(res.headers) ?? 60_000;
			if (!rateRetried && wait <= maxWait) {
				rateRetried = true;
				await sleep(wait, opts.signal);
				continue;
			}
			throw new SourceError(
				service,
				`Zenodo is getting too many requests from this browser; try again in ${seconds(wait)} seconds.`,
				[ZENODO_REASONS.rateLimited],
				429,
			);
		}
		if (res.status >= 500 && attempt < attempts) {
			await sleep(1000 * attempt, opts.signal);
			continue;
		}
		if (!res.ok) {
			const detail = zenodoErrorMessage(body);
			// A 403 without a token, or as an HTML page, is Zenodo's traffic block, not about the token.
			const isJson = /^\s*\{/.test(body);
			if (token && (res.status === 401 || (res.status === 403 && isJson)))
				throw new SourceError(
					service,
					`Zenodo refused the access token. ${detail}`.trim(),
					[ZENODO_REASONS.tokenRefused],
					res.status,
				);
			if (res.status === 401 || res.status === 403)
				throw new SourceError(
					service,
					`Zenodo refused the request (${res.status}): ${detail}`,
					[ZENODO_REASONS.unreachable],
					res.status,
				);
			if (res.status === 404 && url.includes("/api/communities/"))
				throw new SourceError(
					service,
					`There is no such Zenodo community. ${detail}`.trim(),
					[ZENODO_REASONS.notFound],
					404,
				);
			if (res.status === 400)
				throw new SourceError(
					service,
					`Zenodo did not understand the search: ${detail}`,
					[ZENODO_REASONS.queryError],
					400,
				);
			throw new SourceError(
				service,
				`Zenodo answered ${res.status}: ${detail}`,
				[ZENODO_REASONS.unreachable],
				res.status,
			);
		}

		let json: { hits?: { hits?: unknown; total?: unknown } };
		try {
			json = JSON.parse(body);
		} catch {
			throw new SourceError(service, `Zenodo did not answer with JSON: ${body.slice(0, 120)}`, [
				ZENODO_REASONS.badResponse,
			]);
		}
		if (!Array.isArray(json.hits?.hits))
			throw new SourceError(service, "Zenodo's answer has no search results.", [ZENODO_REASONS.badResponse]);
		const total = json.hits.total;
		const remaining = Number(res.headers.get("x-ratelimit-remaining"));
		const reset = Number(res.headers.get("x-ratelimit-reset"));
		return {
			hits: json.hits.hits as ZenodoHit[],
			// Elasticsearch 7 can give {value, relation}.
			total: typeof total === "number" ? total : Number((total as { value?: unknown })?.value ?? 0),
			...(res.headers.has("x-ratelimit-remaining") && Number.isFinite(remaining) ? { remaining } : {}),
			...(res.headers.has("x-ratelimit-reset") && Number.isFinite(reset) ? { resetAt: reset * 1000 } : {}),
		};
	}
}
