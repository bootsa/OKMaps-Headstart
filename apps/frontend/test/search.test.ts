import { loadDefaultResources } from "@okmaps/pipeline";
import { describe, expect, it } from "vitest";
import { buildMap, type SearchRequest, type Stage, timestamp, visTypeOf } from "../src/search.ts";
import { sparqlConfig, sparqlSourceType } from "../src/sparql-source.ts";
import { zenodoConfig } from "../src/zenodo-source.ts";
import { zoteroConfig } from "../src/zotero-source.ts";
import { fakeFetch, GATEWAY, PLACES } from "./fake-net.ts";

const places = [{ id: "aquanavi", label: "AQUANAVI", preset: "aquanavi" as const, url: PLACES }];
const settings = { gatewayUrl: GATEWAY, fetch: fakeFetch, crossrefMailto: "maps@example.org", places };
const NOW = new Date(2026, 10, 6, 9, 5, 3);

async function make(request: SearchRequest) {
	const stages: Stage[] = [];
	const map = await buildMap(request, settings, loadDefaultResources, (s) => stages.push(s), NOW);
	return { map, stages };
}

function expectLaidOut(docs: Record<string, unknown>[]) {
	expect(docs.length).toBeGreaterThan(0);
	for (const d of docs) {
		expect(Number.isFinite(Number(d.x)) && Number.isFinite(Number(d.y))).toBe(true);
		expect(typeof d.x).toBe("string");
		expect(d.area).toBeTruthy();
	}
}

describe("buildMap", () => {
	it("makes a PubMed map with Crossref citation counts", async () => {
		const { map, stages } = await make({
			service: "pubmed",
			q: "ecology",
			from: "2016-01-01",
			to: "2025-01-01",
			sorting: "most-relevant",
		});
		expect(stages).toEqual(["searching", "citations", "layout"]);
		expect(map.context).toMatchObject({ query: "ecology", service: "pubmed", timestamp: "2026-11-06 09:05:03" });
		expect(JSON.parse(map.context.params)).toEqual({
			from: "2016-01-01",
			to: "2025-01-01",
			sorting: "most-relevant",
			article_types: [],
		});
		expectLaidOut(map.documents);
		const withDoi = map.documents.filter((d) => d.doi);
		expect(withDoi.length).toBeGreaterThan(0);
		for (const d of withDoi) expect(typeof d.citation_count).toBe("number");
	});

	it("makes a BASE map through the gateway", async () => {
		const { map, stages } = await make({
			service: "base",
			q: "digital education",
			from: "1665-01-01",
			to: "2024-01-01",
			sorting: "most-relevant",
			document_types: ["121"],
		});
		expect(stages).toEqual(["searching", "layout"]);
		expect(map.documents.length).toBeGreaterThan(50);
		expectLaidOut(map.documents);
	});

	it("makes a BASE streamgraph", async () => {
		const { map } = await make({
			service: "base",
			q: "digital education",
			from: "1665-01-01",
			to: "2024-01-01",
			sorting: "most-relevant",
			document_types: ["121"],
			vis_type: "timeline",
		});
		expect(visTypeOf(map)).toBe("timeline");
		const streams = map.streamgraph!.subject;
		expect(streams.length).toBeGreaterThan(0);
		const ids = new Set(streams.flatMap((s) => s.ids_overall));
		expect(new Set(map.documents.map((d) => d.id))).toEqual(ids);
		// No layout: the records are drawn as streams.
		for (const d of map.documents) expect(d.x).toBeUndefined();
	});

	it("says when the results give no streamgraph", async () => {
		// The PubMed fixture has five records, too few keywords in common.
		const err = await make({
			service: "pubmed",
			q: "ecology",
			from: "2016-01-01",
			to: "2025-01-01",
			sorting: "most-relevant",
			vis_type: "timeline",
		}).catch((e) => e);
		expect(err.reasons).toEqual(["not enough keywords"]);
	});

	it("makes an OpenAIRE project map with the project details in the context", async () => {
		const { map } = await make({ service: "openaire", project_id: "643410", funder: "EC" });
		expectLaidOut(map.documents);
		const params = JSON.parse(map.context.params);
		expect(params).toMatchObject({ project_id: "643410", funder: "EC", acronym: "OpenAIRE2020" });
		expect(params.organisations).toHaveLength(3);
	});

	it("makes a geo map of a place source's whole table", async () => {
		const { memoryTableCache } = await import("@okmaps/sources");
		const placeCache = memoryTableCache();
		const map = await buildMap(
			{ service: "places", source: "aquanavi", title: "" },
			{ ...settings, placeCache },
			loadDefaultResources,
			() => {},
			NOW,
		);
		expect(visTypeOf(map)).toBe("geomap");
		expect(map.context).toMatchObject({ service: "aquanavi", query: "aquatic mesocosm facilities" });
		expect(map.documents).toHaveLength(98);
		expect(String(map.documents[0].coverage)).toMatch(/east=12\.1613; north=58\.3712/);
		// The cached table is used when the source is down.
		const offline = await buildMap(
			{ service: "places", source: "aquanavi", title: "Mesocosms" },
			{ ...settings, placeCache, fetch: async () => new Response("down", { status: 503 }) },
			loadDefaultResources,
		);
		expect(offline.documents).toHaveLength(98);
		expect(JSON.parse(offline.context.params)).toEqual({
			vis_type: "geomap",
			source: "aquanavi",
			custom_title: "Mesocosms",
		});
		expect(offline.context.query).toBe("Mesocosms");
	});

	it("makes a map from a SPARQL source, with Wikipedia introductions", async () => {
		const config = sparqlConfig(sparqlSourceType.presets?.find((p) => p.id === "dbpedia")?.config ?? {});
		const { map, stages } = await make({ service: "sparql", source: "DBpedia", config, q: "coral reef" });
		expect(stages).toEqual(["searching", "layout"]);
		expect(map.context).toMatchObject({ query: "coral reef", service: "sparql" });
		expect(JSON.parse(map.context.params)).toMatchObject({
			source: "DBpedia",
			sparql: { endpoint: "https://dbpedia.org/sparql", wikipediaIntros: true },
		});
		expectLaidOut(map.documents);
		const adventure = map.documents.find((d) => d.title === "Coral Reef Adventure");
		expect(adventure?.paper_abstract).toBe("Coral Reef Adventure is a thing about coral reefs and the sea.");
		expect(adventure?.url).toBe("http://en.wikipedia.org/wiki/Coral_Reef_Adventure");
	});

	it("makes a map from a Zenodo source, without its access token in the map", async () => {
		const config = zenodoConfig({ type: "dataset", limit: "5", token: "secret" });
		const { map, stages } = await make({ service: "zenodo", source: "Zenodo datasets", config, q: "coral reef" });
		expect(stages).toEqual(["searching", "layout"]);
		expect(map.context).toMatchObject({ query: "coral reef", service: "zenodo" });
		expect(JSON.parse(map.context.params)).toEqual({
			source: "Zenodo datasets",
			zenodo: { type: "dataset", limit: 5 },
		});
		expect(JSON.stringify(map)).not.toContain("secret");
		expectLaidOut(map.documents);
		expect(map.documents.find((d) => d.id === "4963256")?.url).toBe("https://zenodo.org/records/4963256");
	});

	it("makes a map from a Zotero collection, without keeping the API key", async () => {
		const config = zoteroConfig({
			api_key: "secret",
			library: "other",
			other_library: "https://www.zotero.org/groups/4846685/pastas/collections/8UG7PVLY",
		});
		const { map } = await make({ service: "zotero", source: "pastas", config, q: "" });
		expect(map.context).toMatchObject({ query: "", service: "zotero" });
		const params = JSON.parse(map.context.params);
		expect(params).toEqual({
			source: "pastas",
			custom_title: "pastas",
			zotero: {
				library: "group:4846685",
				collection: "8UG7PVLY",
				subcollections: false,
				qmode: "titleCreatorYear",
				limit: 100,
			},
		});
		expect(map.context.params).not.toContain("secret");
		expectLaidOut(map.documents);
		expect(map.documents.find((d) => d.id === "VTMZZWFA")?.doi).toBe("10.1111/gwat.13486");
	});

	it("reports provider errors with their reasons", async () => {
		const err = await buildMap(
			{ service: "openaire", project_id: "1", funder: "EC" },
			{ gatewayUrl: GATEWAY, fetch: async () => new Response("<response><results/></response>") },
			loadDefaultResources,
		).catch((e) => e);
		expect(err.reasons).toEqual(["project id or funder id wrong"]);
	});
});

it("reads the view from a map's params", () => {
	const ctx = (params: string) => ({ context: { params } });
	expect(visTypeOf(ctx('{"vis_type":"timeline"}'))).toBe("timeline");
	expect(visTypeOf(ctx("{}"))).toBe("overview");
	expect(visTypeOf(ctx("not json"))).toBe("overview");
});

it("formats timestamps like the server", () => {
	expect(timestamp(new Date(2020, 0, 2, 3, 4, 5))).toBe("2020-01-02 03:04:05");
});
