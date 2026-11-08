/**
 * A small SPARQL 1.1 protocol client for SELECT queries, for browsers,
 * Web Workers and Node. Asks for application/sparql-results+json and turns
 * the endpoint's failures (CORS, rate limits, timeouts, query errors) into
 * SourceErrors with reason codes the frontend can explain.
 */
import { SourceError } from "../errors.js";
import type { FetchFn } from "../http.js";

/** One result row: variable name to value (literals and URIs as text). */
export type SparqlRow = Record<string, string>;

/** A binding as the SPARQL JSON results format gives it. */
export interface SparqlTerm {
	type: "uri" | "literal" | "bnode" | "typed-literal" | "triple";
	value: string;
	"xml:lang"?: string;
	datatype?: string;
}

export interface SparqlResults {
	vars: string[];
	rows: SparqlRow[];
	/** The terms as delivered, for callers that need language tags or datatypes. */
	bindings: Record<string, SparqlTerm>[];
}

export interface SparqlOptions {
	fetch?: FetchFn;
	signal?: AbortSignal;
	/**
	 * GET puts the query in the URL (cached by most endpoints); POST sends it
	 * as a form, which needs no CORS preflight either. "auto" (default) uses
	 * GET up to `maxGetLength` characters of URL, POST beyond.
	 */
	method?: "GET" | "POST" | "auto";
	maxGetLength?: number;
	/** Give up after this long (ms; default 65 s, just over the Wikidata query service's own limit). */
	timeoutMs?: number;
	/** Attempts for network errors and 5xx (default 2). */
	attempts?: number;
	/**
	 * When the endpoint says "too many requests" with a Retry-After of at most
	 * this long, wait and ask once more (ms; default 10 s). Longer waits fail
	 * with the time to wait in the message.
	 */
	maxRetryWaitMs?: number;
	/** Name used in errors (default "sparql"). */
	service?: string;
	/**
	 * Extra request headers. Outside a browser, Wikimedia's endpoints refuse
	 * requests without a User-Agent naming the tool and a contact. In a
	 * browser, extra headers make the request need a CORS preflight.
	 */
	headers?: Record<string, string>;
}

export const SPARQL_JSON = "application/sparql-results+json";

/** Reason codes, explained to people by the frontend (messages.ts). */
export const SPARQL_REASONS = {
	unreachable: "API error: SPARQL endpoint not reachable",
	rateLimited: "API error: SPARQL rate limited",
	timeout: "API error: timeout",
	queryError: "SPARQL query error",
	badResponse: "unexpected SPARQL response",
} as const;

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(t);
			reject(signal.reason);
		});
	});

/** Retry-After in ms: seconds or an HTTP date; null when missing or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
	if (!header) return null;
	const s = header.trim();
	if (/^\d+$/.test(s)) return Number(s) * 1000;
	const t = Date.parse(s);
	return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/**
 * The useful line of an endpoint's error page: Blazegraph and Virtuoso put a
 * Java stack trace or a whole HTML page around one sentence.
 */
export function errorSummary(body: string): string {
	const text = body
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, "\n")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
	const lines = text
		.split(/\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const patterns = [
		/MalformedQueryException:\s*(.+)/,
		/QueryParseException:?\s*(.+)/,
		/Virtuoso \w+ Error \w+:\s*(.+)/,
		/(?:^|\s)Error:\s*(.+)/,
		/Exception:\s*([^:]+(?::[^:]+)?)$/,
	];
	for (const p of patterns) {
		for (const l of lines) {
			const m = p.exec(l);
			if (m) return m[1].trim().slice(0, 300);
		}
	}
	return (lines.find((l) => !l.startsWith("SPARQL-QUERY") && !/^(PREFIX|SELECT)\b/i.test(l)) ?? "").slice(0, 300);
}

const isTimeout = (body: string) => /TimeoutException|timed? ?out|Query timeout|estimated execution time/i.test(body);

function parseResults(body: string, service: string): SparqlResults {
	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		throw new SourceError(
			service,
			`The endpoint did not answer with SPARQL JSON results: ${errorSummary(body) || body.slice(0, 120)}`,
			[SPARQL_REASONS.badResponse],
		);
	}
	const j = json as { head?: { vars?: unknown }; results?: { bindings?: unknown }; boolean?: unknown };
	if (typeof j.boolean === "boolean")
		throw new SourceError(service, "This is an ASK query; a SELECT query is needed.", [SPARQL_REASONS.queryError]);
	if (!Array.isArray(j.results?.bindings))
		throw new SourceError(service, "The endpoint's answer has no results.", [SPARQL_REASONS.badResponse]);
	const bindings = j.results.bindings as Record<string, SparqlTerm>[];
	const vars = Array.isArray(j.head?.vars)
		? (j.head.vars as unknown[]).filter((v): v is string => typeof v === "string")
		: [...new Set(bindings.flatMap((b) => Object.keys(b)))];
	const rows = bindings.map((b) => {
		const row: SparqlRow = {};
		for (const [k, t] of Object.entries(b)) if (t && typeof t.value === "string") row[k] = t.value;
		return row;
	});
	return { vars, rows, bindings };
}

/** Runs a SELECT query on a SPARQL endpoint. */
export async function sparqlSelect(endpoint: string, query: string, opts: SparqlOptions = {}): Promise<SparqlResults> {
	const service = opts.service ?? "sparql";
	const doFetch = opts.fetch ?? (globalThis.fetch as FetchFn);
	const getUrl = `${endpoint}${endpoint.includes("?") ? "&" : "?"}query=${encodeURIComponent(query)}`;
	const method = opts.method ?? "auto";
	const usePost = method === "POST" || (method === "auto" && getUrl.length > (opts.maxGetLength ?? 2000));
	const attempts = Math.max(1, opts.attempts ?? 2);
	const maxWait = opts.maxRetryWaitMs ?? 10_000;
	let rateRetried = false;

	for (let attempt = 1; ; attempt++) {
		const timeout = new AbortController();
		const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? 65_000);
		const onAbort = () => timeout.abort();
		opts.signal?.addEventListener("abort", onAbort);
		let res: Response;
		let body: string;
		try {
			// Only CORS-safelisted headers (unless the caller adds some), so browsers send no preflight.
			res = await doFetch(
				usePost ? endpoint : getUrl,
				usePost
					? {
							method: "POST",
							headers: {
								...opts.headers,
								Accept: SPARQL_JSON,
								"Content-Type": "application/x-www-form-urlencoded",
							},
							body: new URLSearchParams({ query }).toString(),
							signal: timeout.signal,
						}
					: { headers: { ...opts.headers, Accept: SPARQL_JSON }, signal: timeout.signal },
			);
			body = await res.text();
		} catch (err) {
			if (opts.signal?.aborted) throw err;
			if (timeout.signal.aborted)
				throw new SourceError(service, "The SPARQL endpoint did not answer in time.", [SPARQL_REASONS.timeout]);
			if (attempt < attempts) {
				await sleep(1000 * attempt, opts.signal);
				continue;
			}
			// In a browser a refused CORS request looks just like a network error.
			throw new SourceError(
				service,
				`${endpoint} could not be reached, or it does not allow this site (CORS): ${err instanceof Error ? err.message : err}`,
				[SPARQL_REASONS.unreachable],
			);
		} finally {
			clearTimeout(timer);
			opts.signal?.removeEventListener("abort", onAbort);
		}

		if (res.ok) return parseResults(body, service);

		const summary = errorSummary(body);
		if (res.status === 429) {
			const wait = retryAfterMs(res.headers.get("Retry-After"));
			if (!rateRetried && wait !== null && wait <= maxWait) {
				rateRetried = true;
				await sleep(wait, opts.signal);
				continue;
			}
			const when = wait !== null ? ` Try again in ${Math.ceil(wait / 1000)} s.` : " Try again in a minute.";
			throw new SourceError(
				service,
				`The SPARQL endpoint gets too many requests right now.${when}${summary ? ` (${summary})` : ""}`,
				[SPARQL_REASONS.rateLimited],
				429,
			);
		}
		if (isTimeout(body) || res.status === 504)
			throw new SourceError(service, `The query took too long for the endpoint. ${summary}`.trim(), [
				SPARQL_REASONS.timeout,
			]);
		if (res.status === 400 || (res.status === 500 && /Malformed|Parse|syntax|SP030|SP031/i.test(body)))
			throw new SourceError(service, `The endpoint could not run the query: ${summary}`, [SPARQL_REASONS.queryError]);
		if (res.status === 401 || res.status === 403)
			throw new SourceError(
				service,
				`The endpoint refused the request (${res.status})${summary ? `: ${summary}` : "."}`,
				[SPARQL_REASONS.unreachable],
				res.status,
			);
		if (res.status >= 500 && attempt < attempts) {
			await sleep(1000 * attempt, opts.signal);
			continue;
		}
		throw new SourceError(
			service,
			`HTTP failure: ${res.status}${summary ? ` ${summary}` : ""}`,
			[res.status >= 500 ? SPARQL_REASONS.unreachable : SPARQL_REASONS.queryError],
			res.status,
		);
	}
}
