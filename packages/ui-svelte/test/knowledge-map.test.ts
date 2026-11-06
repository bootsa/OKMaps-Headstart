import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { highlightParts, KnowledgeMap, MapState, mapGeometry, queryTerms } from "../src/index";
import { dogEarPath, enlarge, paperPath } from "../src/views/knowledge-map/geometry";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));

describe("highlighting", () => {
	it("parses query terms like the old query reducer", () => {
		expect(queryTerms('"climate change" and (sea OR ice) -arctic title:x [MeSH]')).toEqual([
			"climate change",
			"sea",
			"OR",
			"ice",
			"arctic",
			"titlex",
		]);
		expect(queryTerms(undefined)).toEqual([]);
	});

	it("marks search words anywhere and query terms as whole words", () => {
		expect(highlightParts("Sea ice and seasons", ["sea"])).toEqual([
			{ text: "Sea", mark: "search" },
			{ text: " ice and ", mark: null },
			{ text: "sea", mark: "search" },
			{ text: "sons", mark: null },
		]);
		expect(highlightParts("Sea ice and seasons", [], ["sea"])).toEqual([
			{ text: "Sea", mark: "query" },
			{ text: " ice and seasons", mark: null },
		]);
		expect(highlightParts("a (b) c", ["(b)"])).toHaveLength(3);
	});
});

describe("knowledge map geometry", () => {
	it("centres the zoomed area and scales it to 90% of the chart", () => {
		const state = new MapState(record, 600);
		const area = state.map.areas[0];
		const g = mapGeometry(state.map.areas, state.map.papers, 600, area);
		expect(g.areas[area.uri].x).toBeCloseTo(300);
		expect(g.areas[area.uri].y).toBeCloseTo(300);
		expect(g.areas[area.uri].r).toBeCloseTo(270);
		const paper = area.papers[0];
		expect(g.papers[paper.safeId].w / paper.width).toBeCloseTo(270 / area.r);
	});

	it("draws the paper paths of the old map", () => {
		const r = { x: 0, y: 0, w: 100, h: 200 };
		expect(paperPath(r)).toBe("M 0 0 h 85 l 15 30 v 170 h -100 v -200");
		expect(dogEarPath(r)).toBe("M 85 0 v 30 h 15");
		expect(enlarge(r, 600)).toEqual({ x: 0, y: 0, w: 150, h: 300 });
	});
});

describe("KnowledgeMap", () => {
	const draw = (rec = record) => {
		const state = new MapState(rec, 600);
		const result = render(KnowledgeMap, { state, duration: 0 });
		flushSync();
		return { state, ...result };
	};

	it("draws one bubble per area and every paper", () => {
		const { state, container } = draw();
		expect(container.querySelectorAll(".okm-bubble")).toHaveLength(state.map.areas.length);
		expect(container.querySelectorAll(".okm-paper")).toHaveLength(60);
	});

	it("zooms in on click, selects a paper, and zooms out on the background", async () => {
		const { state, container } = draw();
		const area = state.map.areas[1];
		await fireEvent.click(screen.getByRole("button", { name: area.title }));
		expect(state.zoomedArea).toBe(area.uri);
		expect(container.querySelectorAll(".okm-paper")).toHaveLength(area.papers.length);

		const paper = area.papers[0];
		const shape = [...container.querySelectorAll(".okm-paper")].find((g) => g.textContent?.includes(paper.title));
		expect(shape).toHaveAttribute("role", "button");
		await fireEvent.click(shape as Element);
		expect(state.selectedPaper).toBe(paper.safeId);
		expect(container.querySelector(".okm-paper.selected")).not.toBeNull();

		await fireEvent.click(container.querySelector("rect.background") as Element);
		expect(state.zoomedArea).toBeNull();
	});

	it("hides papers that do not match the search", async () => {
		const { state, container } = draw();
		state.search = state.map.papers[0].title;
		flushSync();
		expect(container.querySelectorAll(".okm-paper").length).toBeLessThan(60);
		expect(container.querySelector("mark.search")).not.toBeNull();
	});

	it("renders crafted area titles and paper titles as text", () => {
		const crafted = '<img src=x onerror="window.hacked=1">';
		const rec = structuredClone(record);
		const uri = rec.documents[0].area_uri;
		for (const d of rec.documents) if (d.area_uri === uri) d.area = crafted;
		rec.documents[0].title = crafted;
		const { container } = draw(rec);
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain(crafted);
	});
});
