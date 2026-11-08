import { describe, expect, it } from "vitest";
import { exportMaps, importMaps, MAPS_FILE_FORMAT, memoryStorage, parseMapsFile, treeStore } from "../src/index.ts";

const map = (id: string, created = "2026-11-01T10:00:00Z") => ({
	id,
	title: `map ${id}`,
	created,
	context: { service: "pubmed" },
	documents: [{}],
});
const store = (folders = true) => treeStore({ id: "s", name: "Store", type: "browser" }, memoryStorage(), { folders });

describe("maps files", () => {
	it("exports a store with its folders and imports it into another, folders and all", async () => {
		const a = store();
		await a.save([], map("one"));
		await a.createFolder?.([], "Reading list");
		await a.createFolder?.(["Reading list"], "Later");
		await a.save(["Reading list"], map("two"));
		await a.save(["Reading list", "Later"], map("three"));
		const file = await exportMaps(a, [], () => new Date("2026-11-08T12:00:00Z"));
		expect(file).toMatchObject({ format: MAPS_FILE_FORMAT, version: 1, exported: "2026-11-08T12:00:00.000Z" });
		expect(file.maps.map((e) => [e.path, e.map.id])).toEqual([
			[[], "one"],
			[["Reading list"], "two"],
			[["Reading list", "Later"], "three"],
		]);

		const b = store();
		const entries = parseMapsFile(JSON.stringify(file));
		expect(await importMaps(b, [], entries)).toEqual({ maps: 3, folders: 2 });
		expect((await b.list([])).folders).toEqual(["Reading list"]);
		expect((await b.get(["Reading list", "Later"], "three"))?.title).toBe("map three");
		// Importing again replaces the same maps and makes no folders.
		expect(await importMaps(b, [], entries)).toEqual({ maps: 3, folders: 0 });
		expect((await b.list([])).maps).toHaveLength(1);
	});

	it("exports one folder, and imports into a folder", async () => {
		const a = store();
		await a.createFolder?.([], "f");
		await a.save(["f"], map("two"));
		await a.save([], map("one"));
		const file = await exportMaps(a, ["f"]);
		expect(file.maps.map((e) => [e.path, e.map.id])).toEqual([[[], "two"]]);
		const b = store();
		await b.createFolder?.([], "in");
		await importMaps(b, ["in"], file.maps);
		expect((await b.list(["in"])).maps.map((m) => m.id)).toEqual(["two"]);
	});

	it("puts every map at the top of a store without folders", async () => {
		const b = store(false);
		await importMaps(
			b,
			[],
			[
				{ path: [], map: map("one") },
				{ path: ["x", "y"], map: map("two", "2026-11-02T10:00:00Z") },
			],
		);
		expect((await b.list([])).maps.map((m) => m.id)).toEqual(["two", "one"]);
	});

	it("reads one map's JSON and refuses anything else", () => {
		expect(parseMapsFile(JSON.stringify(map("solo")))).toEqual([{ path: [], map: map("solo") }]);
		expect(() => parseMapsFile("not json")).toThrow("not JSON");
		expect(() => parseMapsFile("{}")).toThrow("neither a maps file nor a map");
		expect(() => parseMapsFile(JSON.stringify({ format: MAPS_FILE_FORMAT, version: 2, maps: [] }))).toThrow(
			"version 2",
		);
		const bad = (m: unknown, p: unknown = []) =>
			JSON.stringify({ format: MAPS_FILE_FORMAT, version: 1, maps: [{ path: p, map: m }] });
		expect(() => parseMapsFile(bad({ ...map("x"), id: "../evil" }))).toThrow("not a map");
		expect(() => parseMapsFile(bad({ ...map("x"), context: {} }))).toThrow("not a map");
		expect(() => parseMapsFile(bad(map("x"), [".."]))).toThrow("invalid folder name");
		expect(() => parseMapsFile(bad(map("x"), [1]))).toThrow("bad folder");
	});
});
