import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOverviewMap, loadDefaultResources } from "@okmaps/pipeline";
import { beforeEach, describe, expect, it } from "vitest";
import {
	checkZoteroConfig,
	creatorNames,
	doiOf,
	type FetchFn,
	nextLink,
	parseZoteroLibrary,
	resetZoteroBackoff,
	SourceError,
	searchZotero,
	toZoteroRecords,
	waitHeaderMs,
	withoutApiKey,
	withSubcollections,
	ZOTERO_REASONS,
	type ZoteroItem,
	zoteroCollections,
	zoteroGet,
	zoteroLibraries,
	zoteroYear,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(here, "fixtures/zotero", p), "utf8"));
/** Real answers of the public "pastas" group (4846685), 2026-11-08. */
const references: ZoteroItem[] = read("pastas-references.json");
const collections = read("pastas-collections.json");

interface Call {
	url: string;
	init?: RequestInit;
}

/** A fetch that answers from a list, recording the calls. */
function fakeFetch(answers: (Response | Error | ((call: Call) => Response))[]): FetchFn & { calls: Call[] } {
	const calls: Call[] = [];
	const f = (async (url: string, init?: RequestInit) => {
		const call = { url, init };
		calls.push(call);
		const a = answers.shift();
		if (!a) throw new Error(`no answer left for ${url}`);
		if (a instanceof Error) throw a;
		return typeof a === "function" ? a(call) : a;
	}) as FetchFn & { calls: Call[] };
	f.calls = calls;
	return f;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const page = (items: unknown[], total: number, next?: string) =>
	json(items, 200, { "Total-Results": String(total), ...(next ? { Link: `<${next}>; rel="next"` } : {}) });

const headerOf = (c: Call, name: string) => new Headers(c.init?.headers).get(name);

beforeEach(() => resetZoteroBackoff());

describe("parseZoteroLibrary", () => {
	it("reads IDs, prefixes and zotero.org links", () => {
		expect(parseZoteroLibrary("4846685")).toEqual({ library: { type: "group", id: "4846685" } });
		expect(parseZoteroLibrary("group:12")).toEqual({ library: { type: "group", id: "12" } });
		expect(parseZoteroLibrary(" user:45 ")).toEqual({ library: { type: "user", id: "45" } });
		expect(parseZoteroLibrary("users/45")).toEqual({ library: { type: "user", id: "45" } });
		expect(parseZoteroLibrary("https://www.zotero.org/groups/4846685/pastas/collections/8UG7PVLY")).toEqual({
			library: { type: "group", id: "4846685" },
			collection: "8UG7PVLY",
		});
		expect(parseZoteroLibrary("https://www.zotero.org/groups/4846685/pastas/library")).toEqual({
			library: { type: "group", id: "4846685" },
		});
		expect(parseZoteroLibrary("https://api.zotero.org/users/45/collections/ABCD1234/items")).toEqual({
			library: { type: "user", id: "45" },
			collection: "ABCD1234",
		});
	});

	it("refuses names it cannot look up and other sites", () => {
		expect(parseZoteroLibrary("https://www.zotero.org/groups/pastas")).toBeNull();
		expect(parseZoteroLibrary("https://example.org/groups/12")).toBeNull();
		expect(parseZoteroLibrary("pastas")).toBeNull();
		expect(parseZoteroLibrary("")).toBeNull();
	});

	it("checks a config", () => {
		expect(checkZoteroConfig({ library: "group:1" })).toEqual([]);
		expect(checkZoteroConfig({ library: { type: "user", id: "5" }, collection: "ABCD1234" })).toEqual([]);
		expect(checkZoteroConfig({ library: "x" })[0]).toMatch(/Name a library/);
		expect(checkZoteroConfig({ library: "1", collection: "nope" })[0]).toMatch(/8 letters and digits/);
	});
});

describe("Zotero items to records", () => {
	it("maps a real journal article", () => {
		const { papers, content } = toZoteroRecords(references);
		const p = papers.find((x) => x.id === "VTMZZWFA");
		expect(p).toMatchObject({
			identifier: "VTMZZWFA",
			authors: "Collenteur, Raoul A.; Vonk, Martin A.; Haaf, Ezra",
			year: "2025",
			published_in: "Groundwater",
			doi: "10.1111/gwat.13486",
			url: "https://doi.org/10.1111/gwat.13486",
			resulttype: ["Journal article"],
			zotero_url: "https://www.zotero.org/groups/pastas/items/VTMZZWFA",
		});
		expect(p?.paper_abstract).toMatch(/^Abstract The study of hydraulic head changes/);
		expect(content.VTMZZWFA).toContain(p?.title);
		expect(papers).toHaveLength(references.length);
		expect(new Set(papers.map((x) => x.resulttype[0]))).toEqual(new Set(["Journal article", "Book", "Book section"]));
	});

	it("leaves out notes and attachments, keeps tags, DOIs from Extra and single-field names", () => {
		const items: ZoteroItem[] = [
			{ key: "N1", data: { itemType: "note" } },
			{ key: "A1", data: { itemType: "attachment", title: "PDF" } },
			{
				key: "R1",
				links: { alternate: { href: "https://www.zotero.org/groups/x/items/R1" } },
				meta: { parsedDate: "1999" },
				data: {
					itemType: "report",
					title: "  A   report ",
					creators: [
						{ creatorType: "editor", lastName: "Ed", firstName: "Itor" },
						{ creatorType: "contributor", name: "UNESCO" },
					],
					institution: "IOC",
					extra: "Type: x\nDOI: 10.1234/abc.5.",
					tags: [{ tag: "coral" }, { tag: "reef", type: 1 }, { tag: "coral" }],
				},
			},
			{ key: "R1", data: { itemType: "report", title: "duplicate" } },
		];
		const { papers } = toZoteroRecords(items);
		expect(papers).toEqual([
			expect.objectContaining({
				id: "R1",
				title: "A report",
				authors: "Ed, Itor; UNESCO",
				year: "1999",
				published_in: "IOC",
				subject: "coral; reef",
				doi: "10.1234/abc.5",
				url: "https://doi.org/10.1234/abc.5",
				paper_abstract: null,
			}),
		]);
	});

	it("reads years, DOIs and names", () => {
		expect(zoteroYear({ data: { itemType: "book", date: "Spring 1987" } })).toBe("1987");
		expect(zoteroYear({ data: { itemType: "book", date: "" } })).toBe("");
		expect(doiOf({ itemType: "x", DOI: "https://doi.org/10.1000/xyz" })).toBe("10.1000/xyz");
		expect(doiOf({ itemType: "x" })).toBe("");
		expect(doiOf({ itemType: "x", DOI: " 10.1000/ABC.Def " })).toBe("10.1000/abc.def");
		expect(creatorNames([{ creatorType: "author", lastName: "Solo" }])).toEqual(["Solo"]);
	});

	it("makes a knowledge map", async () => {
		const { papers, content } = toZoteroRecords(references);
		const map = buildOverviewMap({ papers, content, service: "zotero" }, await loadDefaultResources());
		expect(map.documents).toHaveLength(papers.length);
		expect(map.documents.every((d) => Number.isFinite(Number(d.x)))).toBe(true);
	});
});

describe("zoteroGet", () => {
	it("sends the version and the key as headers, never in the URL, and reads paging headers", async () => {
		const f = fakeFetch([page([], 51, "https://api.zotero.org/groups/1/items?start=25")]);
		const r = await zoteroGet("/groups/1/items", { q: "x", empty: "" }, { fetch: f, apiKey: " secret " });
		expect(r).toEqual({ data: [], total: 51, next: "https://api.zotero.org/groups/1/items?start=25" });
		expect(f.calls[0].url).toBe("https://api.zotero.org/groups/1/items?q=x");
		expect(headerOf(f.calls[0], "Zotero-API-Version")).toBe("3");
		expect(headerOf(f.calls[0], "Zotero-API-Key")).toBe("secret");
	});

	it("explains private libraries, wrong keys and missing libraries", async () => {
		const err = (status: number, apiKey?: string) =>
			zoteroGet("/groups/1/items", {}, { fetch: fakeFetch([new Response("Forbidden", { status })]), apiKey }).catch(
				(e) => e,
			);
		const noKey = await err(403);
		expect(noKey).toBeInstanceOf(SourceError);
		expect(noKey.reasons).toEqual([ZOTERO_REASONS.forbidden]);
		expect(noKey.message).toMatch(/private. Add an API key/);
		expect((await err(403, "k")).message).toMatch(/this API key cannot read/);
		const missing = await err(404);
		expect(missing.reasons).toEqual([ZOTERO_REASONS.notFound]);
	});

	it("waits for a short Retry-After once, and says how long to wait for a long one", async () => {
		const f = fakeFetch([new Response("", { status: 429, headers: { "Retry-After": "0" } }), page([1], 1)]);
		expect((await zoteroGet("/x", {}, { fetch: f })).data).toEqual([1]);
		expect(f.calls).toHaveLength(2);
		const long = await zoteroGet(
			"/x",
			{},
			{ fetch: fakeFetch([new Response("", { status: 429, headers: { "Retry-After": "120" } })]) },
		).catch((e) => e);
		expect(long.reasons).toEqual([ZOTERO_REASONS.rateLimited]);
		expect(long.message).toMatch(/Try again in 120 s/);
	});

	it("keeps to a Backoff header on the next request", async () => {
		const f = fakeFetch([json([], 200, { Backoff: "600" })]);
		await zoteroGet("/x", {}, { fetch: f });
		const err = await zoteroGet("/y", {}, { fetch: fakeFetch([]) }).catch((e) => e);
		expect(err.reasons).toEqual([ZOTERO_REASONS.rateLimited]);
		expect(err.message).toMatch(/slow down. Try again in 600 s/);
	});

	it("retries a network failure once, then calls Zotero unreachable", async () => {
		const ok = fakeFetch([new TypeError("Failed to fetch"), page([], 0)]);
		await zoteroGet("/x", {}, { fetch: ok, attempts: 2 });
		expect(ok.calls).toHaveLength(2);
		const err = await zoteroGet("/x", {}, { fetch: fakeFetch([new TypeError("Failed to fetch")]), attempts: 1 }).catch(
			(e) => e,
		);
		expect(err.reasons).toEqual([ZOTERO_REASONS.unreachable]);
	});

	it("reads header values", () => {
		expect(waitHeaderMs("5")).toBe(5000);
		expect(waitHeaderMs(null)).toBeNull();
		expect(nextLink('<https://a/x?start=2>; rel="next", <https://a/x?start=8>; rel="last"')).toBe(
			"https://a/x?start=2",
		);
		expect(nextLink('<https://a/x>; rel="last"')).toBeNull();
	});
});

describe("libraries and collections", () => {
	it("lists a key's own library and its groups", async () => {
		const f = fakeFetch([
			json({ userID: 45, username: "steph", access: { user: { library: true } } }),
			page([{ id: 7, data: { name: "Reef lab" } }], 1),
		]);
		expect(await zoteroLibraries("k", { fetch: f })).toEqual([
			{ library: { type: "user", id: "45" }, name: "My library (steph)" },
			{ library: { type: "group", id: "7" }, name: "Reef lab" },
		]);
		expect(f.calls.map((c) => new URL(c.url).pathname)).toEqual(["/keys/current", "/users/45/groups"]);
	});

	it("lists collections as a tree, and finds subcollections", async () => {
		const nested = [
			...collections,
			{ key: "CHILD001", data: { name: "Aquifers", parentCollection: "8UG7PVLY" }, meta: { numItems: 3 } },
			{ key: "CHILD002", data: { name: "Deep", parentCollection: "CHILD001" }, meta: { numItems: 1 } },
		];
		const list = await zoteroCollections("group:4846685", { fetch: fakeFetch([page(nested, nested.length)]) });
		expect(list.map((c) => [c.path, c.depth])).toEqual([
			["publications", 0],
			["references", 0],
			["references / Aquifers", 1],
			["references / Aquifers / Deep", 2],
			["theses", 0],
		]);
		expect(withSubcollections("8UG7PVLY", list)).toEqual(["8UG7PVLY", "CHILD001", "CHILD002"]);
	});
});

describe("searchZotero", () => {
	it("searches a collection, page by page, up to the limit", async () => {
		const f = fakeFetch([
			page(references.slice(0, 12), 20, "https://api.zotero.org/next"),
			page(references.slice(12, 15), 20, "https://api.zotero.org/next"),
		]);
		const r = await searchZotero(
			{ library: "group:4846685", collection: "8UG7PVLY", limit: 15, apiKey: "k" },
			{ q: " groundwater " },
			{ fetch: f },
		);
		expect(r).toMatchObject({ service: "zotero", query: "groundwater", total: 20 });
		expect(r.papers).toHaveLength(15);
		const first = new URL(f.calls[0].url);
		expect(first.pathname).toBe("/groups/4846685/collections/8UG7PVLY/items/top");
		expect(Object.fromEntries(first.searchParams)).toEqual({
			format: "json",
			q: "groundwater",
			qmode: "titleCreatorYear",
			itemType: "-attachment",
			limit: "15",
			start: "0",
		});
		expect(new URL(f.calls[1].url).searchParams.get("start")).toBe("12");
		expect(new URL(f.calls[1].url).searchParams.get("limit")).toBe("3");
		expect(headerOf(f.calls[0], "Zotero-API-Key")).toBe("k");
	});

	it("takes the whole library without search terms, and searches subcollections too", async () => {
		const sub = { key: "CHILD001", data: { name: "Aquifers", parentCollection: "8UG7PVLY" }, meta: {} };
		const f = fakeFetch([
			page([...collections, sub], 4),
			page(references.slice(0, 2), 2),
			page([references[1], references[2]], 2),
		]);
		const r = await searchZotero(
			{ library: { type: "group", id: "4846685" }, collection: "8UG7PVLY", subcollections: true, qmode: "everything" },
			{},
			{ fetch: f },
		);
		expect(r.papers.map((p) => p.id)).toEqual(references.slice(0, 3).map((i) => i.key));
		const paths = f.calls.map((c) => new URL(c.url));
		expect(paths.map((u) => u.pathname)).toEqual([
			"/groups/4846685/collections",
			"/groups/4846685/collections/8UG7PVLY/items/top",
			"/groups/4846685/collections/CHILD001/items/top",
		]);
		expect(paths[1].searchParams.has("q")).toBe(false);
		expect(paths[1].searchParams.has("qmode")).toBe(false);
	});

	it("refuses a config without a library, and keeps the key out of what is shared", async () => {
		const err = await searchZotero({ library: "" }, { q: "x" }, { fetch: fakeFetch([]) }).catch((e) => e);
		expect(err).toBeInstanceOf(SourceError);
		expect(withoutApiKey({ library: "group:1", apiKey: "secret" })).toEqual({ library: "group:1" });
	});
});

// ZOTERO_LIVE=1 pnpm vitest run test/zotero.test.ts
describe.skipIf(!process.env.ZOTERO_LIVE)("live Zotero API", () => {
	it("searches the public pastas group", async () => {
		const list = await zoteroCollections("4846685");
		expect(list.map((c) => c.name)).toContain("references");
		const r = await searchZotero(
			{ library: "https://www.zotero.org/groups/4846685/pastas/collections/8UG7PVLY", collection: "8UG7PVLY" },
			{ q: "groundwater" },
		);
		console.log(r.total, r.papers.length, r.papers[0]);
		expect(r.papers.length).toBeGreaterThan(3);
	}, 30_000);
});
