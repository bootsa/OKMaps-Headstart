import fs from "node:fs";
import path from "node:path";
import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { MapState } from "../src/data/state.svelte";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));

describe("MapState", () => {
	it("starts on the overview with the service's first sort option", () => {
		const state = new MapState(record, 600);
		expect(state.config.service).toBe("base");
		expect(state.sort).toBe("relevance");
		expect(state.zoomedArea).toBeNull();
		expect(state.listed).toHaveLength(60);
	});

	it("zooms into an area and narrows the list", () => {
		const state = new MapState(record, 600);
		const area = state.map.areas[2];
		state.zoomIn(area.uri);
		flushSync();
		expect(state.area?.title).toBe(area.title);
		expect(state.listed).toHaveLength(area.papers.length);
		state.zoomOut();
		expect(state.listed).toHaveLength(60);
	});

	it("selects a paper in its area", () => {
		const state = new MapState(record, 600);
		const paper = state.map.papers[10];
		state.selectPaper(paper.safeId);
		expect(state.zoomedArea).toBe(paper.areaUri);
		expect(state.listed.map((p) => p.safeId)).toEqual([paper.safeId]);
		state.deselectPaper();
		expect(state.paper).toBeUndefined();
	});

	it("updates the list and the matches when searching", () => {
		const state = new MapState(record, 600);
		state.search = "stuff";
		expect(state.listed.length).toBeLessThan(60);
		expect(state.matching.size).toBe(state.listed.length);
	});

	it("resizes the map", () => {
		const state = new MapState(record, 600);
		const r = state.map.areas[0].r;
		state.resize(300);
		expect(state.map.size).toBe(300);
		expect(state.map.areas[0].r).toBeCloseTo(r / 2);
	});
});
