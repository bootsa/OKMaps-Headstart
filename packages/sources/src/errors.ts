/**
 * Errors from source adaptors carry the same `reason` codes that the R data
 * clients return (server/preprocessing/other-scripts/utils.R, detect_error),
 * because the frontend turns those codes into its error messages.
 */

export type ServiceName = "pubmed" | "base" | "openaire" | "orcid" | string;

export class SourceError extends Error {
	readonly service: ServiceName;
	/** Error codes for the frontend, most specific first. */
	readonly reasons: string[];
	/** HTTP status of the failing provider call, when there was one. */
	readonly status?: number;

	constructor(service: ServiceName, message: string, reasons: string[], status?: number) {
		super(message);
		this.name = "SourceError";
		this.service = service;
		this.reasons = reasons;
		this.status = status;
	}
}

/** Raised for HTTP failures; message format follows R's httr ("HTTP failure: 500 ..."). */
export class HttpError extends Error {
	readonly status: number;
	constructor(status: number, body: string) {
		super(`HTTP failure: ${status}\n${body.slice(0, 500)}`);
		this.name = "HttpError";
		this.status = status;
	}
}

/** Raised when the request never got an answer (network down, CORS refused, timeout). */
export class NetworkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NetworkError";
	}
}

export interface DateRange {
	from?: string | null;
	to?: string | null;
}

const DAY_MS = 86_400_000;

/**
 * Maps a failure message to reason codes, as detect_error does in R. Several
 * rules can match at once, so the result is a list.
 */
export function errorReasons(service: ServiceName, message: string, params: DateRange = {}): string[] {
	const reasons: string[] = [];
	const has = (s: string) => message.includes(s);
	if (service === "base") {
		if (has("Timeout was reached: [api.base-search.net]")) reasons.push("BASE error: timeout");
		if (has("BASE not reachable")) reasons.push("API error: BASE not reachable");
		if (reasons.length === 0 && has("Timeout was reached")) reasons.push("API error: timeout");
	}
	if (reasons.length === 0 && service === "pubmed") {
		if (message.startsWith("HTTP failure: 500") && has("error forwarding request"))
			reasons.push("API error: requested metadata size");
		if (message.startsWith("HTTP failure: 500")) reasons.push("API error: PubMed not reachable");
		if (has("Could not resolve host") || has("PubMed not reachable")) reasons.push("API error: PubMed not reachable");
		if (message.startsWith("HTTP failure")) reasons.push("unexpected PubMed API error");
	}
	if (reasons.length === 0 && service === "openaire") {
		if (has("Project not found")) reasons.push("project id or funder id wrong");
		if (has("No results retrieved")) reasons.push("not enough results for project");
		if (reasons.length === 0) reasons.push("API error: OpenAIRE not reachable");
	}
	if (reasons.length === 0) {
		const from = params.from ? Date.parse(params.from) : NaN;
		const to = params.to ? Date.parse(params.to) : NaN;
		const short = Number.isFinite(from) && Number.isFinite(to) && (to - from) / DAY_MS <= 60;
		reasons.push(short ? "timeframe too short" : "not enough results");
	}
	return reasons;
}

/** Wraps any failure of a provider call in a SourceError with reason codes. */
export function toSourceError(service: ServiceName, err: unknown, params: DateRange = {}): SourceError {
	if (err instanceof SourceError) return err;
	const message = err instanceof Error ? err.message : String(err);
	const status = err instanceof HttpError ? err.status : undefined;
	return new SourceError(service, message, errorReasons(service, message, params), status);
}
