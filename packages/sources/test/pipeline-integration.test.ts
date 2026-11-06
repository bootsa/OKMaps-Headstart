/**
 * Adaptor output goes straight into the map pipeline (packages/pipeline).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { buildOverviewMap, loadDefaultResources } from "@okmaps/pipeline";
import { expect, it } from "vitest";
import { searchBase } from "../src/base/index.js";
import { parseOpenaireXml, toOpenaireRecords } from "../src/openaire.js";
import { parsePubmedXml, toPubmedRecords } from "../src/pubmed.js";

const here = path.dirname(fileURLToPath(import.meta.url));

it("builds a map from a BASE search", async () => {
	const xml = zlib
		.gunzipSync(fs.readFileSync(path.join(here, "fixtures/base/base_digital_education.xml.gz")))
		.toString("utf8");
	const res = await searchBase(
		{
			q: "digital education",
			from: "1665-01-01",
			to: "2024-01-01",
			document_types: ["121"],
			limit: 100,
			list_size: 100,
		},
		{ endpoint: "https://gateway.example/base", fetch: async () => new Response(xml), minIntervalMs: 0 },
	);
	const map = buildOverviewMap(
		{ papers: res.papers, content: res.content, service: "base" },
		await loadDefaultResources(),
	);
	expect(map.documents).toHaveLength(res.papers.length);
	expect(map.numAreas).toBeGreaterThan(3);
	for (const d of map.documents) {
		expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
		expect(d.area).not.toBe("");
	}
});

it("builds a map from PubMed records", async () => {
	const xml = fs.readFileSync(path.join(here, "fixtures/pubmed_efetch.xml"), "utf8");
	const { papers, content } = toPubmedRecords(parsePubmedXml(xml));
	const map = buildOverviewMap({ papers, content, service: "pubmed" }, await loadDefaultResources());
	expect(map.documents.map((d) => d.id)).toEqual(papers.map((p) => p.id));
});

it("builds a map from OpenAIRE records", async () => {
	const read = (f: string) => fs.readFileSync(path.join(here, "fixtures/openaire", f), "utf8");
	const rows = [...parseOpenaireXml(read("publications.xml")), ...parseOpenaireXml(read("datasets.xml"))];
	const { papers, content } = toOpenaireRecords(rows);
	const map = buildOverviewMap({ papers, content, service: "openaire" }, await loadDefaultResources());
	expect(map.documents.map((d) => d.id)).toEqual(papers.map((p) => p.id));
});
