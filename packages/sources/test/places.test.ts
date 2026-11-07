import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	aquanaviSource,
	cachedTable,
	getPlaceSource,
	memoryTableCache,
	type PlaceSource,
	parseCsv,
	placeSources,
	registerPlaceSource,
	searchPlaces,
	staticTable,
	toPlaceRecords,
	unregisterPlaceSource,
} from "../src/index.js";
import { offsetDuplicate, parseLocation, pyFloat, timeSpan } from "../src/places/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, p), "utf8");

// Goldens from the old API's mapping: test/golden/py/aquanavi_golden.py
describe.each(["aquanavi", "aquanavi-edge-cases"])("AQUANAVI preset on %s.csv", (name) => {
	it("gives the records the old API gave", async () => {
		const csv = read(`fixtures/places/${name}.csv`);
		const result = await searchPlaces(aquanaviSource(staticTable(parseCsv(csv))));
		expect(result.papers).toEqual(JSON.parse(read(`golden/places/${name}.json`)));
		expect(result.service).toBe("aquanavi");
		expect(result.query).toBe("aquatic mesocosm facilities");
	});
});

it("matches the production map of the mesocosm facilities", async () => {
	// The map embedded on mesocosm.org/facilities (the fixture cuts abstracts
	// to 240 characters and has no image field).
	const production = JSON.parse(read("../../ui-svelte/test/fixtures/aquanavi-geomap.json")).documents;
	const { papers } = await searchPlaces(aquanaviSource(staticTable(parseCsv(read("fixtures/places/aquanavi.csv")))));
	const ours = new Map(papers.map((p) => [p.id, p]));
	expect(ours.size).toBe(production.length);
	for (const doc of production) {
		const p = ours.get(doc.id)!;
		const { relation: _, ...rest } = p;
		expect({ ...rest, paper_abstract: p.paper_abstract.slice(0, 240) }).toEqual(doc);
	}
});

describe("generic place sources", () => {
	const rows = [
		{
			name: "Station A",
			lat: "52.5",
			lon: "13.4",
			info: "Lake station.",
			tags: "lakes\nplankton",
			since: "since 1990",
		},
		{ name: "Station B", lat: "52.5", lon: "13.4", info: "", tags: "", since: "" },
		{ name: "Nowhere", lat: "", lon: "", info: "x", tags: "", since: "" },
	];
	const source: PlaceSource = {
		id: "stations",
		label: "Field stations",
		table: staticTable(rows),
		mapping: {
			title: "name",
			latitude: "lat",
			longitude: "lon",
			years: "since",
			keywords: "tags",
			description: [{ column: "info", label: "About", missing: null }],
			id: (row) => row.name.toLowerCase().replace(/\W+/g, "-"),
		},
	};

	it("map any table by configuration", async () => {
		const { papers } = await searchPlaces(source, { q: "stations" });
		expect(papers.map((p) => p.id)).toEqual(["station-a", "station-b", "nowhere"]);
		expect(papers[0]).toMatchObject({
			title: "Station A",
			paper_abstract: "About: Lake station",
			subject_orig: "lakes; plankton",
			coverage: "country= ; continent= ; east=13.4; north=52.5; start=1990; end=present",
		});
		// Same spot: the second marker is moved a few metres.
		expect(papers[1].coverage).not.toContain("east=13.4;");
		expect(papers[1].paper_abstract).toBe("");
		expect(papers[2].coverage).toBe("country= ; continent= ; east=; north=; start=; end=");
	});

	it("are registered and looked up by id", async () => {
		registerPlaceSource(source);
		expect(getPlaceSource("stations")).toBe(source);
		expect(placeSources().map((s) => s.id)).toContain("stations");
		expect((await searchPlaces("stations")).papers).toHaveLength(3);
		unregisterPlaceSource("stations");
		await expect(searchPlaces("stations")).rejects.toThrow("unknown place source");
	});
});

describe("table cache", () => {
	it("uses a fresh table, refreshes a stale one and falls back to it when the source fails", async () => {
		const cache = memoryTableCache();
		let calls = 0;
		let fail = false;
		const loader = async () => {
			calls++;
			if (fail) throw new Error("down");
			return [{ n: String(calls) }];
		};
		let now = 0;
		const load = cachedTable(loader, { cache, key: "t", maxAgeMs: 100, now: () => now });
		expect(await load({})).toEqual([{ n: "1" }]);
		now = 50;
		expect(await load({})).toEqual([{ n: "1" }]);
		now = 200;
		expect(await load({})).toEqual([{ n: "2" }]);
		fail = true;
		now = 400;
		expect(await load({})).toEqual([{ n: "2" }]);
		expect(calls).toBe(3);
		await expect(cachedTable(loader, { cache: memoryTableCache(), key: "t" })({})).rejects.toThrow("down");
	});

	it("loads CSV and JSON over HTTP", async () => {
		const { csvTable, jsonTable } = await import("../src/index.js");
		const fetch = async (url: string) =>
			new Response(url.endsWith(".csv") ? 'a,b\n1,"x, ""y""\nz"\n' : '{"items":[{"a":1,"b":null}]}');
		expect(await csvTable("https://t/places.csv")({ fetch })).toEqual([{ a: "1", b: 'x, "y"\nz' }]);
		expect(await jsonTable("https://t/places.json", (j) => (j as { items: unknown[] }).items)({ fetch })).toEqual([
			{ a: "1", b: "" },
		]);
	});
});

describe("parts", () => {
	it("read time spans as the old API did", () => {
		expect(timeSpan("2017 - present")).toEqual(["2017", "present"]);
		expect(timeSpan("2019 - 2022")).toEqual(["2019", "2022"]);
		expect(timeSpan("Since 2009")).toEqual(["2009", "present"]);
		expect(timeSpan("operational since 2001")).toEqual(["2001", "present"]);
		expect(timeSpan("2012 — present")).toEqual(["2012", "present"]);
		// Only the em dash was read as a hyphen.
		expect(timeSpan("2016 – present")).toEqual([null, null]);
		expect(timeSpan("")).toEqual([null, null]);
	});

	it("read coordinates written as a Python list", () => {
		expect(parseLocation("['58.3712', ' 12.1613']")).toEqual([58.3712, 12.1613]);
		expect(parseLocation("[45.5, -73.1]")).toEqual([45.5, -73.1]);
		expect(parseLocation("(1, 2)")).toEqual([1, 2]);
		expect(parseLocation("[1, 2, 3]")).toBeNull();
		expect(parseLocation("58.3, 12.1")).toBeNull();
		expect(parseLocation("['a', 'b']")).toBeNull();
	});

	it("spread markers at the same spot", () => {
		expect(offsetDuplicate(10, 20, 0)).toEqual([10, 20]);
		const [lat, lon] = offsetDuplicate(10, 20, 1);
		expect(Math.abs(lat - 10) * 111_111).toBeLessThan(31);
		expect(lon).not.toBe(20);
	});

	it("write floats as Python does", () => {
		expect(pyFloat(12)).toBe("12.0");
		expect(pyFloat(-73.1578)).toBe("-73.1578");
		expect(pyFloat(1e-7)).toBe("1e-07");
	});

	it("keep identical rows once", async () => {
		const row = { Name: "A", url: "u", "Facility location(s) split": "[1, 2]" };
		const { AQUANAVI_MAPPING } = await import("../src/index.js");
		expect(await toPlaceRecords([row, { ...row }], AQUANAVI_MAPPING)).toHaveLength(1);
	});
});
