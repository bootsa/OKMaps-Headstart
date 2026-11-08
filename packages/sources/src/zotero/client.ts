/**
 * A small client for the Zotero Web API v3 (read only), for browsers, Web
 * Workers and Node. api.zotero.org allows any site (CORS) and exposes its
 * paging and rate-limit headers, so the API key goes in the
 * Zotero-API-Key header rather than the URL. Follows the API's Backoff and
 * Retry-After headers, and turns failures into SourceErrors with reason
 * codes the frontend can explain.
 */
import { SourceError } from "../errors.js";
import type { FetchFn } from "../http.js";

export const ZOTERO_API = "https://api.zotero.org";

/** Reason codes, explained to people by the frontend (messages.ts). */
export const ZOTERO_REASONS = {
	unreachable: "API error: Zotero not reachable",
	rateLimited: "API error: Zotero rate limited",
	forbidden: "Zotero access denied",
	notFound: "Zotero library not found",
	timeout: "API error: timeout",
	badResponse: "unexpected Zotero response",
} as const;

export interface ZoteroOptions {
	fetch?: FetchFn;
	signal?: AbortSignal;
	/** Read access to private libraries; never put in a URL. */
	apiKey?: string;
	/** Another API base (a mirror, or a test server; default https://api.zotero.org). */
	apiBase?: string;
	/** Give up on one request after this long (ms; default 30 s). */
	timeoutMs?: number;
	/** Attempts for network errors and 5xx (default 2). */
	attempts?: number;
	/**
	 * Wait this long at most when the API asks for a pause (Backoff, or
	 * Retry-After with a 429/503) and then go on; longer pauses fail with the
	 * time to wait in the message (ms; default 15 s).
	 */
	maxWaitMs?: number;
	/** Name used in errors (default "zotero"). */
	service?: string;
}

export interface ZoteroResponse<T> {
	data: T;
	/** Total-Results: how many there are in all (for paged lists). */
	total: number | null;
	/** The Link header's rel="next", when there is a next page. */
	next: string | null;
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

/** Seconds (or an HTTP date) in a Backoff or Retry-After header, in ms. */
export function waitHeaderMs(header: string | null, now = Date.now()): number | null {
	if (!header) return null;
	const s = header.trim();
	if (/^\d+(\.\d+)?$/.test(s)) return Math.ceil(Number(s) * 1000);
	const t = Date.parse(s);
	return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/** The rel="next" URL of a Link header. */
export function nextLink(header: string | null): string | null {
	if (!header) return null;
	for (const part of header.split(",")) {
		const m = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part);
		if (m) return m[1];
	}
	return null;
}

/**
 * When the API asked us to slow down (Backoff), per API base: requests
 * wait until then, so a search over many pages keeps to it.
 */
const notBefore = new Map<string, number>();

/** Forgets Backoff pauses (for tests). */
export function resetZoteroBackoff(): void {
	notBefore.clear();
}

const shortText = (body: string) =>
	body
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 200);

/**
 * GETs an API path ("/groups/1/items/top") with query parameters, as JSON.
 * Throws SourceErrors: 403 (private library or a key without access), 404
 * (no such library or collection), 429/503 (too many requests), network
 * failures and timeouts.
 */
export async function zoteroGet<T = unknown>(
	path: string,
	params: Record<string, string | number | undefined> = {},
	opts: ZoteroOptions = {},
): Promise<ZoteroResponse<T>> {
	const service = opts.service ?? "zotero";
	const base = (opts.apiBase ?? ZOTERO_API).replace(/\/+$/, "");
	const url = new URL(path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`);
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
	const doFetch = opts.fetch ?? (globalThis.fetch as FetchFn);
	const attempts = Math.max(1, opts.attempts ?? 2);
	const maxWait = opts.maxWaitMs ?? 15_000;
	const headers: Record<string, string> = { "Zotero-API-Version": "3" };
	if (opts.apiKey?.trim()) headers["Zotero-API-Key"] = opts.apiKey.trim();
	let waited = false;

	for (let attempt = 1; ; attempt++) {
		const pause = (notBefore.get(base) ?? 0) - Date.now();
		if (pause > 0) {
			if (pause > maxWait)
				throw new SourceError(
					service,
					`Zotero asked to slow down. Try again in ${Math.ceil(pause / 1000)} s.`,
					[ZOTERO_REASONS.rateLimited],
					429,
				);
			await sleep(pause, opts.signal);
		}
		const timeout = new AbortController();
		const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? 30_000);
		const onAbort = () => timeout.abort();
		opts.signal?.addEventListener("abort", onAbort);
		let res: Response;
		let body: string;
		try {
			res = await doFetch(url.toString(), { headers, signal: timeout.signal });
			body = await res.text();
		} catch (err) {
			if (opts.signal?.aborted) throw err;
			if (timeout.signal.aborted)
				throw new SourceError(service, "Zotero did not answer in time.", [ZOTERO_REASONS.timeout]);
			if (attempt < attempts) {
				await sleep(1000 * attempt, opts.signal);
				continue;
			}
			throw new SourceError(
				service,
				`Zotero could not be reached: ${err instanceof Error ? err.message : String(err)}`,
				[ZOTERO_REASONS.unreachable],
			);
		} finally {
			clearTimeout(timer);
			opts.signal?.removeEventListener("abort", onAbort);
		}

		const backoff = waitHeaderMs(res.headers.get("Backoff"));
		if (backoff !== null) notBefore.set(base, Date.now() + backoff);

		if (res.ok) {
			let data: T;
			try {
				data = JSON.parse(body) as T;
			} catch {
				throw new SourceError(service, `Zotero did not answer with JSON: ${shortText(body)}`, [
					ZOTERO_REASONS.badResponse,
				]);
			}
			const total = res.headers.get("Total-Results");
			return {
				data,
				total: total !== null && /^\d+$/.test(total) ? Number(total) : null,
				next: nextLink(res.headers.get("Link")),
			};
		}

		if (res.status === 429 || res.status === 503) {
			const wait = waitHeaderMs(res.headers.get("Retry-After")) ?? backoff;
			if (!waited && wait !== null && wait <= maxWait) {
				waited = true;
				await sleep(wait, opts.signal);
				continue;
			}
			const when = wait !== null ? ` Try again in ${Math.ceil(wait / 1000)} s.` : " Try again in a minute.";
			throw new SourceError(
				service,
				`Zotero gets too many requests right now.${when}`,
				[ZOTERO_REASONS.rateLimited],
				res.status,
			);
		}
		if (res.status === 403)
			throw new SourceError(
				service,
				opts.apiKey?.trim()
					? "Zotero refused access: this API key cannot read that library (or the key is wrong)."
					: "Zotero refused access: this library is private. Add an API key that can read it.",
				[ZOTERO_REASONS.forbidden],
				403,
			);
		if (res.status === 404)
			throw new SourceError(
				service,
				"Zotero has no such library or collection. Check the user or group ID and the collection.",
				[ZOTERO_REASONS.notFound],
				404,
			);
		if (res.status >= 500 && attempt < attempts) {
			await sleep(1000 * attempt, opts.signal);
			continue;
		}
		throw new SourceError(
			service,
			`HTTP failure: ${res.status} ${shortText(body)}`.trim(),
			[res.status >= 500 ? ZOTERO_REASONS.unreachable : ZOTERO_REASONS.badResponse],
			res.status,
		);
	}
}
