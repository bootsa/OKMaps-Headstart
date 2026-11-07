import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import {
	getView,
	MapState,
	type MapView,
	mapViews,
	processMap,
	registerView,
	unregisterView,
	Visualization,
	viewsFor,
} from "../src/index";
import ListView from "./fixtures/ListView.svelte";

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
const record = fixture("base-map.json");
const aquanavi = fixture("aquanavi-geomap.json");

/** A view of its own: the papers as a plain list, in the record's order. */
const listView: MapView = {
	id: "plain-list",
	label: "Plain list",
	process: ({ record, papers, size }) => ({ context: record.context, papers, areas: [], streams: [], size }),
	component: ListView,
};

afterEach(() => unregisterView("plain-list"));

describe("map views", () => {
	it("registers the core views", () => {
		expect(mapViews().map((v) => v.id)).toEqual(["overview", "timeline", "geomap"]);
		expect(getView("overview").zoomsToArea).toBe(true);
	});

	it("says which views fit a record", () => {
		expect(viewsFor(record).map((v) => v.id)).toEqual(["overview"]);
		expect(viewsFor(aquanavi).map((v) => v.id)).toContain("geomap");
	});

	it("fails clearly for a view nobody registered", () => {
		expect(() => processMap(record, 600, { config: { visType: "nope" } as never })).toThrow(/no view registered/);
	});

	it("draws a map with a registered view", () => {
		registerView(listView);
		const state = new MapState(record, 600, { visType: "plain-list" });
		expect(state.view).toBe(listView);
		expect(state.map.areas).toEqual([]);
		render(Visualization, { state, height: 600 });
		expect(screen.getByTestId("list-view").children).toHaveLength(record.documents.length);
		// Only the knowledge map offers map styles.
		expect(screen.queryByText("Map style")).toBeNull();
	});

	it("puts the knowledge map's style picker in the settings", () => {
		render(Visualization, { state: new MapState(record, 600), height: 600 });
		expect(screen.getByText("Map style")).toBeInTheDocument();
	});

	it("does not zoom into an area in views without areas", () => {
		registerView(listView);
		const state = new MapState(record, 600, { visType: "plain-list" });
		state.selectPaper(state.map.papers[0].safeId);
		expect(state.zoomedArea).toBeNull();
	});
});
