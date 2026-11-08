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
	combineResults,
	type FetchFn,
	fetchBaseContentProviders,
	getOpenaireProject,
	type SourceResult,
	type SparqlSourceConfig,
	searchBase,
	searchOpenaire,
	searchOpenalex,
	searchPlaces,
	searchPubmed,
	searchSparql,
	searchZenodo,
	searchZotero,
	type TableCache,
	withoutApiKey,
	type ZenodoSourceConfig,
	type ZoteroSourceConfig,
} from "@okmaps/sources";
import type { OpenalexPublicConfig, OpenalexSecrets } from "./openalex-source.ts";
import { placeSource } from "./place-source.ts";
import type { PlaceSourceConfig } from "./places.ts";
import { visTypeOf } from "./vis-type.ts";

export type { VisType } from "./vis-type.ts";
export { visTypeOf } from "./vis-type.ts";

export type Service =
	| "pubmed"
	| "base"
	| "openaire"
	| "places"
	| "sparql"
	| "zenodo"
	| "zotero"
	| "openalex"
	| "combined";

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

/** A search on a Zenodo source someone set up on the settings page (src/zenodo-source.ts). */
export interface ZenodoRequest {
	service: "zenodo";
	/** The source's name, kept with the map. */
	source: string;
	/** Its access token only travels to the worker; maps keep the config without it. */
	config: ZenodoSourceConfig;
	q: string;
	vis_type?: SearchView;
}

/** A search in a Zotero library someone set up on the settings page (src/zotero-source.ts). */
export interface ZoteroRequest {
	service: "zotero";
	/** The source's name, kept with the map. */
	source: string;
	/** May hold an API key: it is used here but never kept with the map. */
	config: ZoteroSourceConfig;
	/** Empty takes every item. */
	q: string;
	vis_type?: SearchView;
}

/**
 * A search on an OpenAlex source someone set up on the settings page
 * (src/openalex-source.ts). No API key in here: requests are kept with maps.
 */
export interface OpenalexRequest {
	service: "openalex";
	/** The source's name, kept with the map. */
	source: string;
	/** The source instance's id, to find its API key (SearchSettings.openalex). */
	sourceId: string;
	config: OpenalexPublicConfig;
	q: string;
	from?: string;
	to?: string;
	sorting?: "most-relevant" | "most-recent" | "most-cited";
	vis_type?: SearchView;
}

/** The keyword searches a combined search can run. */
export type CombinableRequest =
	| PubmedRequest
	| BaseSearchRequest
	| SparqlRequest
	| ZenodoRequest
	| ZoteroRequest
	| OpenalexRequest;

/**
 * One search on several sources: each request runs, and the records come
 * together in one map, each work once (packages/sources combineResults).
 */
export interface CombinedRequest {
	service: "combined";
	q: string;
	/** Each source's own request, with the source's name. */
	parts: { label: string; request: CombinableRequest }[];
	vis_type?: SearchView;
}

export type SearchRequest =
	| CombinedRequest
	| PubmedRequest
	| BaseSearchRequest
	| OpenaireRequest
	| PlacesRequest
	| SparqlRequest
	| ZenodoRequest
	| ZoteroRequest
	| OpenalexRequest;

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
	/** API keys and addresses of the person's OpenAlex sources, by source id (never kept with maps). */
	openalex?: OpenalexSecrets;
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
	req: Exclude<SearchRequest, PlacesRequest | CombinedRequest>,
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
	if (req.service === "openalex") {
		const secrets = s.openalex?.[req.sourceId] ?? {};
		const result = await searchOpenalex(
			{ ...req.config, ...secrets },
			{ q: req.q, from: req.from, to: req.to, sorting: req.sorting },
			http,
		);
		if (result.papers.length === 0) throw Object.assign(new Error("no results"), { reasons: ["not enough results"] });
		// How the map was made, without the API key or address.
		const params = {
			source: req.source,
			openalex: req.config,
			from: req.from ?? "",
			to: req.to ?? "",
			sorting: req.sorting ?? "most-relevant",
			...(result.partial ? { partial: result.partial } : {}),
			...visType,
		};
		return { result, query: req.q, params };
	}
	if (req.service === "zenodo") {
		const result = await searchZenodo(req.config, { q: req.q }, http);
		if (result.papers.length === 0) throw Object.assign(new Error("no results"), { reasons: ["not enough results"] });
		// The config says how the map was made; never the access token (maps are shared and stored elsewhere).
		const { accessToken: _, ...zenodo } = req.config;
		const params = { source: req.source, zenodo, ...visType };
		return { result, query: req.q, params };
	}
	if (req.service === "zotero") {
		const result = await searchZotero(req.config, { q: req.q }, http);
		if (result.papers.length === 0) throw Object.assign(new Error("no results"), { reasons: ["not enough results"] });
		// How the map was made, without the API key (maps get shared).
		// Without search terms the map shows the whole library or collection: name it after the source.
		const params = {
			source: req.source,
			zotero: withoutApiKey(req.config),
			...(req.q.trim() ? {} : { custom_title: req.source }),
			...visType,
		};
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
	const { result, query, params } =
		req.service === "combined" ? await fetchCombined(req, settings) : await fetchSource(req, settings);
	let papers = result.papers;
	if (req.service === "pubmed") {
		onStage("citations");
		papers = await addCitationCounts(papers, { fetch: settings.fetch, mailto: settings.crossrefMailto });
	} else if (req.service === "combined" && papers.some((p) => p.source_service === "pubmed")) {
		// PubMed records get Crossref citation counts, as in a PubMed map.
		onStage("citations");
		const pubmed = papers.filter((p) => p.source_service === "pubmed");
		const counted = new Map(
			(await addCitationCounts(pubmed, { fetch: settings.fetch, mailto: settings.crossrefMailto })).map((p) => [
				p.id,
				p,
			]),
		);
		papers = papers.map((p) => counted.get(p.id) ?? p);
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

/**
 * Runs each part of a combined search. Sources that fail are left out (and
 * named in the map's params); when every one fails, the first failure is
 * the map's.
 */
async function fetchCombined(
	req: CombinedRequest,
	s: SearchSettings,
): Promise<{ result: SourceResult; query: string; params: Record<string, unknown> }> {
	const runs = await Promise.allSettled(
		req.parts.map(async ({ label, request }) => ({ label, request, ...(await fetchSource(request, s)) })),
	);
	const done = runs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
	const failed = runs.flatMap((r, i) =>
		r.status === "rejected" ? [{ label: req.parts[i].label, error: r.reason }] : [],
	);
	if (!done.length) throw failed[0]?.error ?? new Error("no sources");
	const result = combineResults(done.map((d) => ({ service: d.request.service, label: d.label, result: d.result })));
	if (!result.papers.length) throw Object.assign(new Error("no results"), { reasons: ["not enough results"] });
	const params = {
		sources: done.map((d) => ({ label: d.label, service: d.request.service, query: d.query, params: d.params })),
		duplicates: result.duplicates,
		...(failed.length
			? {
					failed: failed.map((f) => ({
						label: f.label,
						error: f.error instanceof Error ? f.error.message : String(f.error),
					})),
				}
			: {}),
		...(req.vis_type === "timeline" ? { vis_type: "timeline" } : {}),
	};
	return { result, query: req.q, params };
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
