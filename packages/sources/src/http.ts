import { HttpError, NetworkError } from "./errors.js";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
	/** fetch implementation; defaults to the global one. Tests pass a recorder. */
	fetch?: FetchFn;
	signal?: AbortSignal;
	/** Attempts per request for network errors, 429 and 5xx (default 3). */
	attempts?: number;
	/** First retry delay in ms, doubled each time (default 1000). */
	retryDelayMs?: number;
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

const retryable = (status: number) => status === 429 || status >= 500;

/** Fetches a URL and returns the body as text, retrying transient failures. */
export async function fetchText(url: string, init: RequestInit, opts: HttpOptions = {}): Promise<string> {
	const doFetch = opts.fetch ?? (globalThis.fetch as FetchFn);
	const attempts = Math.max(1, opts.attempts ?? 3);
	let delay = opts.retryDelayMs ?? 1000;
	let lastError: Error = new NetworkError("no attempt made");
	for (let attempt = 1; attempt <= attempts; attempt++) {
		let res: Response;
		try {
			res = await doFetch(url, { ...init, signal: opts.signal });
		} catch (err) {
			if (opts.signal?.aborted) throw err;
			lastError = new NetworkError(err instanceof Error ? err.message : String(err));
			if (attempt < attempts) await sleep(delay, opts.signal);
			delay *= 2;
			continue;
		}
		const body = await res.text();
		if (res.ok) return body;
		lastError = new HttpError(res.status, body);
		if (!retryable(res.status) || attempt === attempts) break;
		await sleep(delay, opts.signal);
		delay *= 2;
	}
	throw lastError;
}

/** Builds a query string, skipping null, undefined and empty values. */
export function queryString(params: Record<string, string | number | null | undefined>): string {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.append(k, String(v));
	return sp.toString();
}
