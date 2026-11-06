/**
 * One map from start to finish: the provider search, Crossref citation
 * counts where the server adds them (PubMed), the map layout, and the
 * record the visualisation reads. Runs in the Web Worker (src/worker.ts)
 * and in Node tests.
 */

import { buildOverviewMap, type PipelineResources, toLegacyRecords } from "@okmaps/pipeline";
import {
	addCitationCounts,
	type FetchFn,
	fetchBaseContentProviders,
	getOpenaireProject,
	type SourceResult,
	searchBase,
	searchOpenaire,
	searchPubmed,
} from "@okmaps/sources";

export type Service = "pubmed" | "base" | "openaire";

export interface PubmedRequest {
	service: "pubmed";
	q: string;
	from: string;
	to: string;
	sorting: "most-relevant" | "most-recent";
	article_types?: string[];
}

export interface BaseSearchRequest {
	service: "base";
	q: string;
	from: string;
	to: string;
	sorting: "most-relevant" | "most-recent";
	/** BASE dctypenorm codes; 121 is journal article. */
	document_types: string[];
}

export interface OpenaireRequest {
	service: "openaire";
	project_id: string;
	funder: string;
}

export type SearchRequest = PubmedRequest | BaseSearchRequest | OpenaireRequest;

export interface SearchSettings {
	/** Gateway base URL (packages/gateway), for BASE and the OpenAIRE fallback. */
	gatewayUrl: string;
	/** Call OpenAIRE through the gateway instead of directly. */
	openaireViaGateway?: boolean;
	/** Contact address for Crossref's polite pool. */
	crossrefMailto?: string;
	/** NCBI API key (raises PubMed's rate limit). */
	pubmedApiKey?: string;
	fetch?: FetchFn;
}

/** What the visualisation's local_files mode reads (the getLatestRevision.php shape). */
export interface MapRecord {
	context: { id: string; query: string; service: Service; timestamp: string; params: string };
	documents: Record<string, unknown>[];
}

export type Stage = "searching" | "citations" | "layout";

const PAGE = { pubmed: 100, base: 120 };

/** "2026-11-06 14:05:09", the timestamp format of the server's map context. */
export function timestamp(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const gateway = (s: SearchSettings, path: string) => `${s.gatewayUrl.replace(/\/$/, "")}${path}`;

async function fetchSource(
	req: SearchRequest,
	s: SearchSettings,
): Promise<{ result: SourceResult; query: string; params: Record<string, unknown> }> {
	const http = { fetch: s.fetch };
	if (req.service === "pubmed") {
		const params = { from: req.from, to: req.to, sorting: req.sorting, article_types: req.article_types ?? [] };
		const result = await searchPubmed({ q: req.q, ...params, limit: PAGE.pubmed }, { ...http, apiKey: s.pubmedApiKey });
		return { result, query: req.q, params };
	}
	if (req.service === "base") {
		const params = { from: req.from, to: req.to, sorting: req.sorting, document_types: req.document_types };
		// Without the provider list, journal volume and issue are just not split out.
		const contentProviders = await fetchBaseContentProviders(gateway(s, "/base/repositories"), http).catch(
			() => undefined,
		);
		const result = await searchBase(
			{ q: req.q, ...params, limit: PAGE.base, list_size: 100 },
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
	const { result, query, params } = await fetchSource(req, settings);
	let papers = result.papers;
	if (req.service === "pubmed") {
		onStage("citations");
		papers = await addCitationCounts(papers, { fetch: settings.fetch, mailto: settings.crossrefMailto });
	}
	onStage("layout");
	const map = buildOverviewMap({ papers, content: result.content, service: req.service }, await resources(), {
		taxonomySeparator: ";",
	});
	return {
		context: {
			id: crypto.randomUUID(),
			query,
			service: req.service,
			timestamp: timestamp(now),
			params: JSON.stringify(params),
		},
		documents: toLegacyRecords(map),
	};
}
