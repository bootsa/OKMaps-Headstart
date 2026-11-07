/**
 * Place sources: tables of places (facilities, sites, stations, ...) that
 * become geo maps. A source is a table loader plus a mapping of its
 * columns, so it can be configured rather than coded; sources are kept in
 * a registry, like the map views, so a deployment offers the ones it
 * registers. AQUANAVI (./aquanavi.ts) is one preset.
 */
import type { HttpOptions } from "../http.js";
import { type PlaceMapping, type PlaceRecord, toPlaceRecords } from "./mapping.js";
import { cachedTable, type TableCache, type TableLoader } from "./table.js";

export { AQUANAVI_MAPPING, aquanaviSource } from "./aquanavi.js";
export { parseCsv, type Row } from "./csv.js";
export {
	type DescriptionSection,
	offsetDuplicate,
	type PlaceMapping,
	type PlaceRecord,
	parseLocation,
	pyFloat,
	timeSpan,
	toPlaceRecords,
} from "./mapping.js";
export {
	type CacheOptions,
	cachedTable,
	csvTable,
	jsonTable,
	memoryTableCache,
	staticTable,
	type TableCache,
	type TableLoader,
} from "./table.js";

export interface PlaceSource {
	/** The map's service ("aquanavi"); the map's settings and info page are looked up by it. */
	id: string;
	/** Shown in the source choice. */
	label: string;
	/** The map title when the search gives none. */
	title?: string;
	table: TableLoader;
	mapping: PlaceMapping;
}

export interface PlaceResult {
	service: string;
	papers: PlaceRecord[];
	/** Text per record (title and description), as other sources give it. */
	content: Record<string, string>;
	query: string;
}

export interface PlaceOptions extends HttpOptions {
	/** Keep the last table here and fall back to it when the source can't be reached. */
	cache?: TableCache;
	/** How long a cached table is used without asking the source (ms; default 1 day). */
	maxAgeMs?: number;
}

const registry = new Map<string, PlaceSource>();

/** Adds (or replaces) a place source. */
export function registerPlaceSource(source: PlaceSource): void {
	registry.set(source.id, source);
}

export function unregisterPlaceSource(id: string): void {
	registry.delete(id);
}

export function getPlaceSource(id: string): PlaceSource | undefined {
	return registry.get(id);
}

/** The registered sources, in the order they were registered. */
export function placeSources(): PlaceSource[] {
	return [...registry.values()];
}

/**
 * Every place of a source (the old AQUANAVI API also returned the whole
 * table, whatever the query). `source` is a registered id or a source.
 */
export async function searchPlaces(
	source: string | PlaceSource,
	params: { q?: string } = {},
	opts: PlaceOptions = {},
): Promise<PlaceResult> {
	const s = typeof source === "string" ? registry.get(source) : source;
	if (!s) throw new Error(`unknown place source: ${source}`);
	const load = opts.cache ? cachedTable(s.table, { cache: opts.cache, key: s.id, maxAgeMs: opts.maxAgeMs }) : s.table;
	const papers = await toPlaceRecords(await load(opts), s.mapping);
	return {
		service: s.id,
		papers,
		content: Object.fromEntries(papers.map((p) => [p.id, `${p.title} ${p.paper_abstract}`])),
		query: params.q ?? s.title ?? "",
	};
}
