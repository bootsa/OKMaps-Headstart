/**
 * Where a place source's table comes from: a CSV or JSON file at a URL
 * for now; a SPARQL endpoint, Wikidata or an Atomic Data collection can
 * be another TableLoader returning the same rows. A cache keeps the last
 * table, so a map can still be made when the source is down.
 */
import { fetchText, type HttpOptions } from "../http.js";
import { parseCsv, type Row } from "./csv.js";

export type { Row } from "./csv.js";

/** Loads a source's rows (one object of column name to text per place). */
export type TableLoader = (http: HttpOptions) => Promise<Row[]>;

/** A CSV file with a header line. */
export function csvTable(url: string, delimiter = ","): TableLoader {
	return async (http) => parseCsv(await fetchText(url, {}, http), delimiter);
}

/**
 * A JSON file: a list of objects, or `rows(json)` picks them out. Values
 * that are not strings are written as JSON text (null and missing as "").
 */
export function jsonTable(url: string, rows: (json: unknown) => unknown[] = (j) => j as unknown[]): TableLoader {
	return async (http) =>
		rows(JSON.parse(await fetchText(url, {}, http))).map((item) =>
			Object.fromEntries(
				Object.entries(item as Record<string, unknown>).map(([k, v]) => [
					k,
					typeof v === "string" ? v : v == null ? "" : JSON.stringify(v),
				]),
			),
		);
}

/** Rows given directly (tests, or a table bundled with the page). */
export const staticTable =
	(rows: Row[]): TableLoader =>
	async () =>
		rows;

/**
 * Where cached tables are kept. A MapStorage from @okmaps/storage (e.g.
 * indexedDbStorage("okmaps-place-cache")) fits as it is.
 */
export interface TableCache {
	get(key: string): Promise<string | null>;
	put(key: string, body: string): Promise<void>;
}

export function memoryTableCache(): TableCache {
	const m = new Map<string, string>();
	return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}

export interface CacheOptions {
	cache: TableCache;
	/** Cache key, e.g. the source id. */
	key: string;
	/** A cached table younger than this is used without asking the source (ms; default 1 day). */
	maxAgeMs?: number;
	now?: () => number;
}

/**
 * Loads through a cache: a fresh cached table is used as it is; otherwise
 * the source is asked, and if that fails a stale cached table is used.
 */
export function cachedTable(load: TableLoader, opts: CacheOptions): TableLoader {
	const now = opts.now ?? Date.now;
	const maxAge = opts.maxAgeMs ?? 24 * 60 * 60 * 1000;
	const key = `${opts.key}.json`;
	return async (http) => {
		const raw = await opts.cache.get(key).catch(() => null);
		const cached = raw ? (JSON.parse(raw) as { time: number; rows: Row[] }) : null;
		if (cached && now() - cached.time < maxAge) return cached.rows;
		try {
			const rows = await load(http);
			await opts.cache.put(key, JSON.stringify({ time: now(), rows })).catch(() => undefined);
			return rows;
		} catch (err) {
			if (cached) return cached.rows;
			throw err;
		}
	};
}
