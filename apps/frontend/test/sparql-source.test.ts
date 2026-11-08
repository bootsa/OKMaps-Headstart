import { SPARQL_PRESETS } from "@okmaps/sources";
import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/messages.ts";
import { sparqlConfig, sparqlSourceType } from "../src/sparql-source.ts";

describe("SPARQL source type", () => {
	it("offers the presets, and their settings give back the adaptor's config", async () => {
		expect(sparqlSourceType.presets?.map((p) => p.id)).toEqual(["wikipedia", "wikidata-scholarly", "dbpedia"]);
		for (const p of sparqlSourceType.presets ?? []) {
			const kept = p.config;
			const original = SPARQL_PRESETS.find((x) => x.id === p.id)?.config;
			expect(sparqlConfig(kept)).toEqual({ mapping: {}, wikipediaIntros: false, ...original });
			expect(await sparqlSourceType.check?.(kept)).toEqual([]);
		}
	});

	it("reads mapping, limit and language from the settings", () => {
		const c = sparqlConfig({
			endpoint: " https://x.org/sparql ",
			query: 'SELECT ?s { "{{q}}" }',
			limit: "5000",
			lang: "",
			wikipedia: "",
			map_title: "?label",
			map_subject: "",
		});
		expect(c).toEqual({
			endpoint: "https://x.org/sparql",
			query: 'SELECT ?s { "{{q}}" }',
			mapping: { title: "?label" },
			limit: 1000,
			lang: "en",
			wikipediaIntros: false,
		});
	});

	it("refuses a query without the search terms", async () => {
		expect(await sparqlSourceType.check?.({ endpoint: "https://x.org/sparql", query: "SELECT * {}" })).toEqual([
			"The query must use the search terms: {{q}} or {{q_words}}.",
		]);
	});

	it("makes requests named after the person's source", () => {
		const s = sparqlSourceType.module({
			id: "a",
			type: "sparql",
			name: "My Wikipedia",
			config: { endpoint: "https://query.wikidata.org/sparql", query: '"{{q}}"', wikipedia: "on" },
		});
		expect(s.description).toBe("Asks query.wikidata.org");
		expect(s.request({ q: " coral " }, "timeline")).toMatchObject({
			service: "sparql",
			source: "My Wikipedia",
			q: "coral",
			vis_type: "timeline",
			config: { wikipediaIntros: true },
		});
	});

	it("shows what the endpoint said", () => {
		expect(errorMessage(["API error: SPARQL rate limited"], "Try again in 60 s.")).toBe(
			"The map could not be made: Try again in 60 s.",
		);
		expect(errorMessage(["API error: timeout"], "x")).toBe("The search took too long. Please try again.");
	});
});
