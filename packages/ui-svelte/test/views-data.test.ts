import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapConfig } from "../src/data/config";
import { parsePlace } from "../src/data/papers";
import { processMap } from "../src/data/process";
import { MapState } from "../src/data/state.svelte";
import { parseStreams } from "../src/data/streams";

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));

describe("geo map data", () => {
	// The AQUANAVI mesocosm facilities map (openknowledgemaps.org, April 2026).
	const record = fixture("aquanavi-geomap.json");

	it("parses coverage into a place", () => {
		expect(
			parsePlace("country=Sweden; continent=Europe; east=12.1613; north=58.3712; start=2017; end=present"),
		).toEqual({
			country: "Sweden",
			continent: "Europe",
			east: 12.1613,
			north: 58.3712,
		});
		expect(parsePlace("country=; continent=Asia; east=; north=x")).toEqual({
			country: null,
			continent: "Asia",
			east: null,
			north: null,
		});
		expect(parsePlace(undefined)).toBeNull();
	});

	it("gives the facilities of the AQUANAVI map their places", () => {
		const map = processMap(record, 600, {
			config: mapConfig("aquanavi", { visType: "geomap" }),
		});
		expect(map.papers).toHaveLength(98);
		const located = map.papers.filter((p) => p.place?.east != null && p.place?.north != null);
		expect(located.length).toBeGreaterThan(80);
		for (const p of located) {
			expect(Math.abs(p.place!.east!)).toBeLessThanOrEqual(180);
			expect(Math.abs(p.place!.north!)).toBeLessThanOrEqual(90);
		}
	});

	it("finds facilities by country in the list search", () => {
		const state = new MapState(record, 600, { visType: "geomap" });
		state.search = "sweden";
		expect(state.listed.length).toBeGreaterThan(0);
		expect(
			state.listed.every(
				(p) => p.place?.country === "Sweden" || JSON.stringify(p.raw).toLowerCase().includes("sweden"),
			),
		).toBe(true);
	});

	it("leaves places out of other maps", () => {
		const map = processMap(record, 600, { config: mapConfig("aquanavi") });
		expect(map.papers.every((p) => p.place === null)).toBe(true);
	});
});

describe("streamgraph data", () => {
	const data = fixture("streamgraph.json");
	// What the old DataManager (d3 v3 stack, silhouette) made of the same data.
	const legacy: Array<{
		key: string;
		docIds: string[];
		points: Array<{ date: string; y0: number; y: number }>;
	}> = fixture("streamgraph.legacy.json");

	it("stacks the streams like the old visualisation, up to a constant vertical shift", () => {
		const streams = parseStreams(structuredClone(data));
		expect(streams.map((s) => s.key)).toEqual(legacy.map((s) => s.key));
		// d3 v3 put the silhouette's baseline at (max total - total) / 2, d3-shape at -total / 2:
		// the same picture, shifted by max total / 2.
		const shift = legacy[0].points[0].y0 - streams[0].points[0].y0;
		streams.forEach((s, k) => {
			expect(s.docIds).toEqual(legacy[k].docIds);
			s.points.forEach((pt, i) => {
				const old = legacy[k].points[i];
				expect(pt.date.toISOString()).toBe(old.date);
				expect(pt.value).toBeCloseTo(old.y);
				expect(pt.y0 + shift).toBeCloseTo(old.y0);
			});
		});
	});

	it("tapers the streams to zero a year before and after", () => {
		const streams = parseStreams(JSON.stringify(data));
		for (const s of streams) {
			expect(s.points).toHaveLength(6);
			expect(s.points[0].value).toBe(0);
			expect(s.points[5].value).toBe(0);
		}
		expect(parseStreams(null)).toEqual([]);
	});

	it("lists a selected stream's papers", () => {
		const record = {
			context: { service: "base" },
			documents: ["a", "b", "c", "d"].map((id) => ({ id, title: id })),
			streamgraph: data,
		};
		const state = new MapState(record, 600, { visType: "timeline" });
		expect(state.map.areas).toEqual([]);
		expect(state.map.streams).toHaveLength(3);
		state.selectStream("warming");
		expect(state.listed.map((p) => p.id).sort()).toEqual(["a", "d"]);
		state.selectStream(null);
		expect(state.listed).toHaveLength(4);
	});
});
