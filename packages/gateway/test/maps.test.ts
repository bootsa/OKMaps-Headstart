import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileStorage } from "@okmaps/storage/node";
import { describe, expect, it } from "vitest";
import { createGateway } from "../src/gateway.ts";
import { MAP_ID, type MapStore, memoryStore, storageMapStore } from "../src/maps.ts";

const map = {
	title: "climate change",
	context: { id: "c1", query: "climate change", service: "pubmed", timestamp: "2026-11-06 09:00:00", params: "{}" },
	documents: [
		{ id: "1", title: "A", area: "Warming", x: "0.1", y: "-0.2" },
		{ id: "2", title: "B", area: "Warming", x: "0.3", y: "0.2" },
	],
};

function setup(store: MapStore = memoryStore(), extra = {}) {
	const handler = createGateway({
		baseApiKey: "k",
		allowedOrigins: ["https://maps.example.org"],
		maps: { store, ...extra },
		fetch: async () => new Response("unused"),
	});
	const post = (body: unknown, headers: Record<string, string> = {}, address = "1.1.1.1") =>
		handler(
			new Request("https://gw.example/maps", {
				method: "POST",
				headers: { "content-type": "application/json", origin: "https://maps.example.org", ...headers },
				body: typeof body === "string" ? body : JSON.stringify(body),
			}),
			{ address },
		);
	const get = (id: string) => handler(new Request(`https://gw.example/maps/${id}`), { address: "2.2.2.2" });
	return { handler, post, get };
}

describe("published maps", () => {
	it("are stored under a content id and served unchanged", async () => {
		const { post, get } = setup();
		const res = await post({ ...map, extra: "dropped" });
		expect(res.status).toBe(201);
		expect(res.headers.get("access-control-allow-origin")).toBe("https://maps.example.org");
		const { id } = await res.json();
		expect(id).toMatch(MAP_ID);
		// The same map gets the same id.
		expect((await (await post(map)).json()).id).toBe(id);
		const got = await get(id);
		expect(got.status).toBe(200);
		expect(got.headers.get("cache-control")).toContain("immutable");
		expect(await got.json()).toEqual(map);
	});

	it("refuse what is not a map", async () => {
		const { post } = setup();
		const bad = async (body: unknown, headers = {}) => {
			const res = await post(body, headers);
			return [res.status, (await res.json()).error];
		};
		expect(await bad("not json")).toEqual([400, "body is not JSON"]);
		expect(await bad(map, { "content-type": "text/plain" })).toEqual([415, "send the map as application/json"]);
		expect(await bad({ ...map, documents: [] })).toEqual([400, "documents must be a list of 1 to 1000 records"]);
		expect(await bad({ ...map, context: { ...map.context, service: "evil" } })).toEqual([400, "unknown service"]);
		expect(await bad({ ...map, documents: [{ id: "1", area: "a", x: "x", y: 1 }] })).toEqual([
			400,
			"each document needs x and y",
		]);
		expect(await bad({ ...map, title: 5 })).toEqual([400, "title must be a string"]);
		expect(await bad({ ...map, documents: [{ area: "a", x: 1, y: 1 }] })).toEqual([400, "each document needs an id"]);
	});

	it("take streamgraphs, whose records have no place on a chart", async () => {
		const { post, get } = setup();
		const timeline = {
			...map,
			context: { ...map.context, params: JSON.stringify({ vis_type: "timeline" }) },
			documents: [{ id: "1", title: "A", year: "2020", subject: "warming" }],
		};
		const res = await post(timeline);
		expect(res.status).toBe(201);
		expect(await (await get((await res.json()).id)).json()).toEqual(timeline);
		const overview = { ...timeline, context: map.context };
		expect((await post(overview)).status).toBe(400);
	});

	it("refuse large maps and too many publications", async () => {
		const { post } = setup(memoryStore(), { maxBytes: 600, publishLimit: { requests: 2, windowMs: 60_000 } });
		const big = { ...map, documents: [...map.documents, { id: "3", area: "x".repeat(700), x: 0, y: 0 }] };
		expect((await post(big)).status).toBe(413);
		expect((await post(map)).status).toBe(201);
		expect((await post(map)).status).toBe(429);
		expect((await post(map, {}, "9.9.9.9")).status).toBe(201);
	});

	it("answer 404 for unknown or malformed ids, and when publishing is off", async () => {
		const { get } = setup();
		expect((await get("0".repeat(24))).status).toBe(404);
		expect((await get("../etc/passwd")).status).toBe(404);
		const off = createGateway({ baseApiKey: "k", allowedOrigins: ["*"] });
		expect((await off(new Request("https://gw.example/maps", { method: "POST", body: "{}" }))).status).toBe(404);
	});

	it("can be kept as files", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "okmaps-maps-"));
		const { post, get } = setup(storageMapStore(fileStorage(path.join(dir, "maps"))));
		const { id } = await (await post(map)).json();
		expect(fs.readdirSync(path.join(dir, "maps"))).toEqual([`${id}.json`]);
		expect(await (await get(id)).json()).toEqual(map);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
