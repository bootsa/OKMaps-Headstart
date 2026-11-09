import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	AppSettings,
	contextItems,
	getViewType,
	hasViewType,
	type MapRecord,
	mapConfig,
	mapTitle,
	processMap,
	registerViewType,
	strings,
	unregisterViewType,
	type ViewType,
	viewTypesFor,
} from "../src";

const fixture = (name: string): MapRecord =>
	JSON.parse(fs.readFileSync(path.join(__dirname, "../../ui-svelte/test/fixtures", name), "utf8"));

describe("drawing a map without any UI framework", () => {
	it("processes a knowledge map into areas and papers", () => {
		const record = fixture("base-map.json");
		const map = processMap(record, 600);
		expect(map.areas.length).toBeGreaterThan(1);
		expect(map.papers).toHaveLength(record.documents.length);
		for (const a of map.areas) expect(a.r).toBeGreaterThan(0);
	});

	it("processes a streamgraph and a geo map with their view types", () => {
		const record = fixture("base-map.json");
		const streamgraph = fixture("streamgraph.json") as unknown as MapRecord["streamgraph"];
		const stream = processMap({ ...record, streamgraph }, 600, {
			config: mapConfig("base", { visType: "timeline" }),
		});
		expect(stream.areas).toEqual([]);
		expect(stream.streams.length).toBeGreaterThan(0);
		const geo = processMap(fixture("aquanavi-geomap.json"), 600, {
			config: mapConfig("aquanavi", { visType: "geomap" }),
		});
		expect(geo.papers.some((p) => p.place)).toBe(true);
	});

	it("words the title and context line from the view type", () => {
		const record = fixture("base-map.json");
		const config = mapConfig("base");
		const s = strings(config.language);
		expect(mapTitle(config, record.context, s).kind).toBeTruthy();
		const map = processMap(record, 600);
		const context = { service: "base", params: { from: "2010-01-01", to: "2020-12-31" } };
		expect(contextItems(config, context, map.papers, s)[0]).toMatchObject({ id: "num_articles" });
	});

	it("offers the view types a record fits", () => {
		const ids = viewTypesFor(fixture("aquanavi-geomap.json")).map((v) => v.id);
		expect(ids).toContain("geomap");
		expect(viewTypesFor(fixture("base-map.json")).map((v) => v.id)).not.toContain("geomap");
	});
});

describe("view type registry", () => {
	afterEach(() => unregisterViewType("list"));

	it("takes a view type of one's own and names unknown ones", () => {
		const list: ViewType = {
			id: "list",
			label: "List",
			process: ({ record, papers, size }) => ({ context: record.context, papers, areas: [], streams: [], size }),
			strings: { heading: "overview_label", backlink: "backlink_list" },
			citation: { kind: "km", type: "List" },
		};
		registerViewType(list);
		expect(hasViewType("list")).toBe(true);
		const map = processMap(fixture("base-map.json"), 600, { config: mapConfig("base", { visType: "list" }) });
		expect(map.areas).toEqual([]);
		expect(() => getViewType("nope")).toThrow(/no view registered for visType "nope"/);
	});
});

const memory = () => {
	const data = new Map<string, string>();
	return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("AppSettings (plain)", () => {
	it("tells subscribers about every change and keeps the old arrays as they were", () => {
		const settings = new AppSettings({ storage: memory() });
		let calls = 0;
		const stop = settings.subscribe(() => calls++);
		const before = settings.stores;
		settings.putStore({ id: "a", type: "memory", name: "A", config: {} });
		expect(calls).toBe(1);
		expect(before).toEqual([]);
		expect(settings.stores.map((s) => s.id)).toEqual(["a"]);
		expect(settings.saveTo).toEqual({ store: "a", path: [] });
		settings.setSourceEnabled("pubmed", false);
		expect(settings.sourceEnabled("pubmed")).toBe(false);
		expect(calls).toBe(2);
		stop();
		settings.removeStore("a");
		expect(calls).toBe(2);
		expect(settings.saveTo).toBe("none");
	});

	it("reads back what it wrote", () => {
		const storage = memory();
		const a = new AppSettings({ storage });
		a.putStore({ id: "x", type: "memory", name: "X", config: { url: "u" } });
		const b = new AppSettings({ storage });
		expect(b.toJSON()).toEqual(a.toJSON());
	});

	it("lets a UI layer track reads through observe()", () => {
		let reads = 0;
		class Tracked extends AppSettings {
			protected override observe() {
				reads++;
			}
		}
		const s = new Tracked({ storage: null });
		expect(reads).toBe(0);
		void s.stores;
		void s.saveTo;
		expect(reads).toBe(2);
	});
});
