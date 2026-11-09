import fs from "node:fs";
import path from "node:path";
import { memoryStoreType } from "@okmaps/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AppSettings,
	ExplorerState,
	type MapFields,
	type MapRecord,
	MapState,
	placeKey,
	registerStoreType,
	unregisterStoreType,
} from "../src";

const record: MapRecord = JSON.parse(
	fs.readFileSync(path.join(__dirname, "../../ui-svelte/test/fixtures/base-map.json"), "utf8"),
);

describe("MapState without a UI framework", () => {
	it("tells subscribers which field changed, once per real change", () => {
		const state = new MapState(record, 600);
		const changed: (keyof MapFields)[] = [];
		const stop = state.subscribe((f) => changed.push(f));
		const area = state.map.areas[0];
		state.zoomIn(area.uri);
		expect(changed).toEqual(["zoomedArea"]);
		state.zoomIn(area.uri);
		expect(changed).toEqual(["zoomedArea"]);
		state.search = "x";
		state.hoveredPaper = state.map.papers[0].safeId;
		expect(changed).toEqual(["zoomedArea", "search", "hoveredPaper"]);
		stop();
		state.zoomOut();
		expect(changed).toHaveLength(3);
	});

	it("works out the list from its fields, and keeps it until one of them changes", () => {
		const state = new MapState(record, 600);
		const all = state.listed;
		expect(all).toHaveLength(record.documents.length);
		expect(state.listed).toBe(all);
		state.hoveredArea = state.map.areas[0].uri;
		expect(state.listed).toBe(all);
		const area = state.map.areas[0];
		state.zoomIn(area.uri);
		expect(state.listed).toHaveLength(area.papers.length);
		expect(state.area?.uri).toBe(area.uri);
		state.zoomOut();
		state.selectPaper(area.papers[0].safeId);
		expect(state.zoomedArea).toBe(area.uri);
		expect(state.paper?.safeId).toBe(area.papers[0].safeId);
		state.search = "zzzz-no-such-word";
		expect(state.matching.size).toBe(0);
		expect(state.searchWords).toEqual(["zzzz-no-such-word"]);
	});

	it("tells a UI layer about every read through observe()", () => {
		const reads: string[] = [];
		class Tracked extends MapState {
			protected override observe(field: keyof MapFields) {
				reads.push(field);
			}
		}
		const state = new Tracked(record, 600);
		expect(reads).toEqual([]);
		void state.listed;
		expect(reads).toEqual(
			expect.arrayContaining(["map", "search", "filter", "sort", "zoomedArea", "selectedPaper", "selectedStream"]),
		);
		expect(reads).not.toContain("hoveredPaper");
	});

	it("rescales the map back at the overview", () => {
		const state = new MapState(record, 600);
		state.zoomIn(state.map.areas[0].uri);
		const before = state.map;
		state.scale("content_based");
		expect(state.zoomedArea).toBeNull();
		expect(state.map).not.toBe(before);
		expect(state.config.contentBased).toBe(true);
	});
});

describe("ExplorerState without a UI framework", () => {
	beforeEach(() => registerStoreType(memoryStoreType));
	afterEach(() => unregisterStoreType("memory"));

	it("lists folders and says what it did, replacing its records on each change", async () => {
		const settings = new AppSettings({
			storage: null,
			seed: () => ({ stores: [{ id: "s", type: "memory", name: "Mem", config: {} }] }),
		});
		const ex = new ExplorerState(settings);
		const changed: string[] = [];
		ex.subscribe((f) => changed.push(f));
		const before = ex.listings;
		await ex.toggle("s", []);
		expect(ex.isExpanded("s", [])).toBe(true);
		expect(ex.listing("s", [])?.status).toBe("ready");
		expect(before).toEqual({});
		expect(await ex.createFolder("s", [], "Reading")).toBe(true);
		expect(ex.listing("s", [])?.folders).toEqual(["Reading"]);
		expect(ex.message).toBe("Folder Reading made.");
		expect(changed).toContain("message");
		await ex.toggle("s", ["Reading"]);
		expect(await ex.deleteFolder("s", [], "Reading")).toBe(true);
		expect(Object.keys(ex.listings)).toEqual([placeKey("s", [])]);
	});
});
