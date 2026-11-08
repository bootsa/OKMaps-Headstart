/**
 * One map from start to finish: the provider search, Crossref citation
 * counts where the server adds them (PubMed), the map layout, and the
 * record the visualisation reads. Runs in the Web Worker (src/worker.ts)
 * and in Node tests.
 */

import { buildOverviewMap, type PipelineResources, toLegacyRecords } from "@okmaps/pipeline";
import {
	buildStreamgraph,
	type StreamgraphData,
	StreamgraphError,
	streamgraphDocuments,
} from "@okmaps/pipeline/streamgraph";
import {
	addCitationCounts,
	type FetchFn,
	fetchBaseContentProviders,
	getOpenaireProject,
	type SourceResult,
	type SparqlSourceConfig,
	searchBase,
	searchOpenaire,
	searchPlaces,
	searchPubmed,
	searchSparql,
	type TableCache,
} from "@okmaps/sources";
import { placeSource } from "./place-source.ts";
import type { PlaceSourceConfig } from "./places.ts";
import { visTypeOf } from "./vis-type.ts";

export type { VisType } from "./vis-type.ts";
export { visTypeOf } from "./vis-type.ts";

export type Service = "pubmed" | "base" | "openaire" | "places" | "sparql";

/** The views a search can ask for; place sources make geo maps. */
type SearchView = "overview" | "timeline";

export interface PubmedRequest {
	service: "pubmed";
	q: string;
	from: string;
	to: string;
	sorting: "most-relevant" | "most-recent";
	article_types?: string[];
	vis_type?: SearchView;
}

export interface BaseSearchRequest {
	service: "base";
	q: string;
	from: string;
	to: string;
	sorting: "most-relevant" | "most-recent";
	/** BASE dctypenorm codes; 121 is journal article. */
	document_types: string[];
	vis_type?: SearchView;
}

export interface OpenaireRequest {
	service: "openaire";
	project_id: string;
	funder: string;
}

/** A geo map of every place in a place source (src/places.ts). */
export interface PlacesRequest {
	service: "places";
	/** The place source's id. */
	source: string;
	/** Map title (default: the source's). */
	title?: string;
}

/** A search on a SPARQL source someone set up on the settings page (src/sparql-source.ts). */
export interface SparqlRequest {
	service: "sparql";
	/** The source's name, kept with the map. */
	source: string;
	config: SparqlSourceConfig;
	q: string;
	vis_type?: SearchView;
}

export type SearchRequest = PubmedRequest | BaseSearchRequest | OpenaireRequest | PlacesRequest | SparqlRequest;

export interface SearchSettings {
	/** Gateway base URL (packages/gateway), for BASE and the OpenAIRE fallback. */
	gatewayUrl: string;
	/** Call OpenAIRE through the gateway instead of directly. */
	openaireViaGateway?: boolean;
	/** Contact address for Crossref's polite pool. */
	crossrefMailto?: string;
	/** NCBI API key (raises PubMed's rate limit). */
	pubmedApiKey?: string;
	/** The place sources offered for geo maps. */
	places?: PlaceSourceConfig[];
	/** Where place tables are cached (the worker passes IndexedDB). */
	placeCache?: TableCache;
	fetch?: FetchFn;
}

/**
 * What the visualisation's local_files mode reads (the getLatestRevision.php
 * shape). A streamgraph has `vis_type: "timeline"` in its params.
 */
export interface MapRecord {
	/** `service` is the provider, or a place source's id ("aquanavi"). */
	context: { id: string; query: string; service: string; timestamp: string; params: string };
	documents: Record<string, unknown>[];
	/** Keyword counts per year (streamgraphs); the map page recomputes them when missing. */
	streamgraph?: StreamgraphData;
}

export type Stage = "searching" | "citations" | "layout";

/** Records per search; the old API asked BASE for 1000 for a streamgraph. */
const PAGE = { pubmed: 100, base: 120, baseTimeline: 1000 };

/** "2026-11-06 14:05:09", the timestamp format of the server's map context. */
export function timestamp(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const gateway = (s: SearchSettings, path: string) => `${s.gatewayUrl.replace(/\/$/, "")}${path}`;

async function fetchSource(
	req: Exclude<SearchRequest, PlacesRequest>,
	s: SearchSettings,
): Promise<{ result: SourceResult; query: string; params: Record<string, unknown> }> {
	const http = { fetch: s.fetch };
	const timeline = req.service !== "openaire" && req.vis_type === "timeline";
	const visType = timeline ? { vis_type: "timeline" } : {};
	if (req.service === "sparql") {
		const result = await searchSparql(req.config, { q: req.q }, http);
		if (result.papers.length === 0) throw Object.assign(new Error("no results"), { reasons: ["not enough results"] });
		// The whole config, so the map says how it was made (and a shared copy can be made again).
		const params = { source: req.source, sparql: req.config, ...visType };
		return { result, query: req.q, params };
	}
	if (req.service === "pubmed") {
		const params = {
			from: req.from,
			to: req.to,
			sorting: req.sorting,
			article_types: req.article_types ?? [],
			...visType,
		};
		const result = await searchPubmed({ q: req.q, ...params, limit: PAGE.pubmed }, { ...http, apiKey: s.pubmedApiKey });
		return { result, query: req.q, params };
	}
	if (req.service === "base") {
		const params = {
			from: req.from,
			to: req.to,
			sorting: req.sorting,
			document_types: req.document_types,
			...visType,
		};
		// Without the provider list, journal volume and issue are just not split out.
		const contentProviders = await fetchBaseContentProviders(gateway(s, "/base/repositories"), http).catch(
			() => undefined,
		);
		const result = await searchBase(
			timeline
				? { q: req.q, ...params, limit: PAGE.baseTimeline, list_size: PAGE.baseTimeline }
				: { q: req.q, ...params, limit: PAGE.base, list_size: 100 },
			// The gateway spaces BASE requests for all users, so no client-side pause.
			{ ...http, endpoint: gateway(s, "/base/search"), contentProviders, minIntervalMs: 0 },
		);
		return { result, query: req.q, params };
	}
	const oa = { ...http, endpoint: s.openaireViaGateway ? gateway(s, "/openaire/") : undefined };
	const project = { project_id: req.project_id, funder: req.funder };
	const [result, details] = await Promise.all([
		searchOpenaire(project, oa),
		getOpenaireProject(project, oa).catch(() => null),
	]);
	return { result, query: req.project_id, params: { ...project, ...(details ?? {}) } };
}

/** Runs a search and lays out the map. `onStage` reports progress. */
export async function buildMap(
	req: SearchRequest,
	settings: SearchSettings,
	resources: () => Promise<PipelineResources>,
	onStage: (stage: Stage) => void = () => {},
	now = new Date(),
): Promise<MapRecord> {
	onStage("searching");
	if (req.service === "places") return buildPlaceMap(req, settings, now);
	const { result, query, params } = await fetchSource(req, settings);
	let papers = result.papers;
	if (req.service === "pubmed") {
		onStage("citations");
		papers = await addCitationCounts(papers, { fetch: settings.fetch, mailto: settings.crossrefMailto });
	}
	onStage("layout");
	const context = {
		id: crypto.randomUUID(),
		query,
		service: req.service,
		timestamp: timestamp(now),
		params: JSON.stringify(params),
	};
	if (visTypeOf({ context }) === "timeline") {
		// The old server's timeline: keyword streams instead of the layout,
		// and only the records that appear in them.
		let streamgraph: StreamgraphData;
		try {
			streamgraph = buildStreamgraph(papers, { query });
		} catch (err) {
			if (err instanceof StreamgraphError) throw Object.assign(err, { reasons: ["not enough keywords"] });
			throw err;
		}
		return { context, documents: streamgraphDocuments(papers, streamgraph), streamgraph };
	}
	const map = buildOverviewMap({ papers, content: result.content, service: req.service }, await resources(), {
		taxonomySeparator: ";",
	});
	return { context, documents: toLegacyRecords(map) };
}

/** A geo map: every place of the source, drawn where it is (no layout, as on the old server). */
async function buildPlaceMap(req: PlacesRequest, settings: SearchSettings, now: Date): Promise<MapRecord> {
	const config = settings.places?.find((p) => p.id === req.source);
	if (!config) throw new Error(`unknown place source: ${req.source}`);
	const result = await searchPlaces(
		placeSource(config),
		{ q: req.title || undefined },
		{ fetch: settings.fetch, cache: settings.placeCache },
	);
	if (result.papers.length === 0) throw Object.assign(new Error("no places"), { reasons: ["not enough results"] });
	const params: Record<string, unknown> = { vis_type: "geomap", source: config.id };
	if (req.title) params.custom_title = req.title;
	return {
		context: {
			id: crypto.randomUUID(),
			query: result.query,
			service: config.id,
			timestamp: timestamp(now),
			params: JSON.stringify(params),
		},
		documents: result.papers as unknown as Record<string, unknown>[],
	};
}
