import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { mapConfig } from "../src/data/config";
import {
	contextItems,
	Header,
	MapState,
	mapTitle,
	metadataQuality,
	registerPlugin,
	strings,
	timespan,
	unregisterPlugin,
} from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));
const s = strings("eng");
const base = mapConfig("base");

describe("map title", () => {
	it("names the search, a project, a custom title or a preset", () => {
		expect(mapTitle(base, { service: "base", query: "sea ice" }, s)).toEqual({
			kind: "standard",
			label: "Knowledge Map of",
			text: "sea ice",
			full: "sea ice",
		});
		const viper = mapConfig("openaire");
		const project = mapTitle(
			viper,
			{ service: "openaire", query: "123", params: { title: "A".repeat(60), acronym: "ACR", project_id: "123" } },
			s,
		);
		expect(project).toMatchObject({ kind: "project", projectId: "123" });
		expect(project.kind === "project" && project.text.length).toBe(47);
		expect(mapTitle(base, { query: "q", custom_title: "My map" }, s)).toMatchObject({ kind: "custom", text: "My map" });
		expect(mapTitle(mapConfig("base", { presetTitle: "Fixed" }), {}, s)).toEqual({ kind: "basic", text: "Fixed" });
		expect(mapTitle(mapConfig("base", { createTitleFromContext: false }), {}, s)).toEqual({
			kind: "basic",
			text: "Overview of documents",
		});
	});
});

describe("context line", () => {
	const now = new Date("2026-11-07T12:00:00Z");

	it("shows the time span like the old map", () => {
		const ctx = (from: string, to: string) => ({ service: "base", params: { from, to } });
		expect(timespan(base, ctx("1665-01-01", "2026-11-07"), now)).toBe("Until 7 Nov 2026");
		expect(timespan(base, ctx("2000-01-01", "2010-06-30"), now)).toBe("1 Jan 2000 - 30 Jun 2010");
		expect(timespan(base, ctx("2000-01-01", "2030-01-01"), now)).toBe("1 Jan 2000 - 7 Nov 2026");
		expect(timespan(base, { service: "base", params: {} }, now)).toBeNull();
	});

	it("reads data quality from min_descsize", () => {
		expect(metadataQuality({ service: "base", params: { min_descsize: "300" } })).toBe("high");
		expect(metadataQuality({ service: "base", params: { min_descsize: 0 } })).toBe("low");
		expect(metadataQuality({ service: "pubmed", params: { min_descsize: 0 } })).toBe("low");
		expect(metadataQuality({ service: "base", params: {} })).toBeNull();
	});

	it("lists resources, time span, document types and quality", () => {
		const state = new MapState(record, 600);
		const params = JSON.stringify({
			from: "2000-01-01",
			to: "2010-12-31",
			sorting: "most-relevant",
			document_types: ["121", "F"],
			min_descsize: 300,
		});
		const items = contextItems(base, { service: "base", params }, state.map.papers, s);
		// eng has no data quality strings (as in the old map), so BASE maps show none.
		expect(items.map((i) => i.id)).toEqual(["num_articles", "timespan", "document_types"]);
		expect(items[0].text).toBe("60 most relevant resources");
		expect(items[0].tooltip).toContain("relevance ranking");
		expect(items[2].tooltip).toContain("Journal/newspaper article, Other/Unknown material");
		const pubmed = contextItems(
			mapConfig("pubmed"),
			{ service: "pubmed", params: { min_descsize: 0 } },
			state.map.papers,
			strings("eng_pubmed"),
		);
		expect(pubmed.at(-1)).toMatchObject({ id: "metadata_quality", text: "Data quality" });
		// No search parameters (an old shared map): no context line.
		expect(contextItems(base, { service: "base" }, state.map.papers, s)).toEqual([]);
	});

	it("caps BASE and PubMed counts at 100 and can name the data source", () => {
		const papers = Array.from({ length: 120 }, () => ({ oa: true, resultType: [] })) as never[];
		const cfg = mapConfig("base", { showDataSource: true, showOaNumber: true });
		const items = contextItems(cfg, { service: "base", params: { sorting: "most-recent" } }, papers, s);
		expect(items[0].text).toBe("100 most recent resources (120 open access)");
		expect(items[1]).toEqual({ id: "source", text: "Data source: BASE" });
	});
});

describe("Header", () => {
	afterEach(() => unregisterPlugin("test"));

	it("renders the title and context as text, with plugin items", () => {
		registerPlugin({ id: "test", contextItems: () => [{ id: "extra", text: "From a plugin" }] });
		const crafted = '<img src=x onerror="window.hacked=1">';
		const rec = structuredClone(record);
		rec.context = { ...rec.context, query: crafted, params: { from: "2000-01-01", to: "2001-01-01" } };
		const { container } = render(Header, { state: new MapState(rec, 600) });
		flushSync();
		expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(crafted);
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector('[data-item="timespan"]')?.textContent).toBe("1 Jan 2000 - 1 Jan 2001");
		expect(screen.getByText("From a plugin")).toBeTruthy();
	});

	it("explains terms in a tooltip tied to the term", () => {
		const rec = structuredClone(record);
		rec.context = { ...rec.context, params: { sorting: "most-relevant", from: "1665-01-01", to: "2001-01-01" } };
		render(Header, { state: new MapState(rec, 600) });
		const term = screen.getByText("60 most relevant resources");
		const tip = document.getElementById(term.getAttribute("aria-describedby") ?? "");
		expect(tip?.getAttribute("role")).toBe("tooltip");
		expect(tip?.textContent).toContain("relevance ranking");
	});

	it("names the sources of a map made from several sources", () => {
		const papers = [{ oa: false, resultType: [] }] as never[];
		const params = JSON.stringify({
			sources: [
				{ label: "PubMed", service: "pubmed" },
				{ label: "BASE", service: "base" },
			],
			duplicates: 3,
			failed: [{ label: "Zenodo", error: "timeout" }],
		});
		const items = contextItems(mapConfig("combined"), { service: "combined", params }, papers, s);
		expect(items.find((i) => i.id === "sources")).toEqual({
			id: "sources",
			text: "Sources: PubMed, BASE",
			tooltip: "PubMed, BASE\nFound by more than one: 3\nNot reached: Zenodo",
			more: true,
		});
		const one = contextItems(base, { service: "base", params: { sorting: "most-recent" } }, papers, s);
		expect(one.some((i) => i.id === "sources")).toBe(false);
	});
});
