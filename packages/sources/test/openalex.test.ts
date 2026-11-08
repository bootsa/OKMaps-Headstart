import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOverviewMap, loadDefaultResources } from "@okmaps/pipeline";
import { describe, expect, it } from "vitest";
import {
	abstractFromIndex,
	checkOpenalexConfig,
	type FetchFn,
	lastFirst,
	OPENALEX_REASONS,
	type OpenalexWork,
	openalexFilter,
	openalexUrl,
	plainText,
	SourceError,
	searchOpenalex,
	subjectsOf,
	toOpenalexRecords,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, "fixtures/openalex", p), "utf8");
const page1 = read("works-coral-bleaching-1.json");
const page2 = read("works-coral-bleaching-2.json");

interface Call {
	url: string;
	init?: RequestInit;
}

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

const ok = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
const err = (status: number, body: string, headers: Record<string, string> = {}) =>
	new Response(body, { status, headers: { "Content-Type": "application/json", ...headers } });
const params = (url: string) => new URL(url).searchParams;
const fast = { maxRetryWaitMs: 0 };

describe("OpenAlex records", () => {
	it("rebuilds an abstract from the inverted index", () => {
		expect(abstractFromIndex({ Corals: [0], bleach: [1, 4], when: [2], hot: [3] })).toBe(
			"Corals bleach when hot bleach",
		);
		expect(abstractFromIndex(null)).toBeNull();
		expect(abstractFromIndex({})).toBeNull();
		// Gaps (dropped words) close up; nonsense positions are ignored.
		expect(abstractFromIndex({ a: [0], c: [5], x: [-1, 1.5] })).toBe("a c");
	});

	it("writes names last name first and strips markup from titles", () => {
		expect(lastFirst("Terry P. Hughes")).toBe("Hughes, Terry P.");
		expect(lastFirst("Plato")).toBe("Plato");
		expect(lastFirst("A; B, C")).toBe("C, A B");
		expect(plainText("Growth of <i>Acropora</i> &amp; CO<sub>2</sub>")).toBe("Growth of Acropora & CO2");
	});

	it("takes keywords and topics as subjects, concepts only without them", () => {
		const w: OpenalexWork = {
			id: "https://openalex.org/W1",
			keywords: [{ display_name: "coral bleaching" }, { display_name: "Coral Bleaching" }],
			primary_topic: { display_name: "Coral and Marine Ecosystems Studies" },
			topics: [{ display_name: "Coral and Marine Ecosystems Studies" }, { display_name: "Ocean Acidification" }],
			concepts: [{ display_name: "Biology", level: 0, score: 0.9 }],
		};
		expect(subjectsOf(w)).toEqual(["coral bleaching", "Coral and Marine Ecosystems Studies", "Ocean Acidification"]);
		expect(
			subjectsOf({
				id: "x",
				concepts: [
					{ display_name: "Biology", level: 0, score: 0.9 },
					{ display_name: "Coral reef", level: 2, score: 0.8 },
					{ display_name: "Weak", level: 2, score: 0.1 },
				],
			}),
		).toEqual(["Coral reef"]);
	});

	it("maps real works to records", () => {
		const works = JSON.parse(page1).results as OpenalexWork[];
		const { papers, content } = toOpenalexRecords(works);
		expect(papers).toHaveLength(20);
		const hughes = papers.find((p) => p.doi === "10.1126/science.1085046");
		expect(hughes).toMatchObject({
			id: expect.stringMatching(/^W\d+$/),
			title: "Climate Change, Human Impacts, and the Resilience of Coral Reefs",
			year: "2003",
			published_in: "Science",
			url: "https://doi.org/10.1126/science.1085046",
			oa_state: 0,
			resulttype: ["review"],
		});
		expect(hughes?.authors.split("; ")[0]).toBe("Hughes, Terry P.");
		expect(hughes?.paper_abstract).toMatch(/^The diversity, frequency, and scale of human impacts on coral reefs/);
		expect(hughes?.subject).toContain("coral reefs");
		expect(hughes?.readers).toBeGreaterThan(1000);
		expect(content[hughes?.id ?? ""]).toContain(hughes?.paper_abstract);
		// Works without an abstract still come through, with no abstract.
		const nature = papers.find((p) => p.doi === "10.1038/nature21707");
		expect(nature?.title).toBe("Global warming and recurrent mass bleaching of corals");
		expect(nature?.paper_abstract).toBeNull();
	});

	it("skips untitled works and repeats", () => {
		const { papers } = toOpenalexRecords([
			{ id: "https://openalex.org/W1", display_name: "One" },
			{ id: "https://openalex.org/W1", display_name: "One again" },
			{ id: "https://openalex.org/W2", display_name: null },
			{ id: "https://openalex.org/W3", title: "Three", doi: "https://doi.org/10.1234/abc" },
		]);
		expect(papers.map((p) => [p.id, p.title, p.url])).toEqual([
			["W1", "One", "https://openalex.org/W1"],
			["W3", "Three", "https://doi.org/10.1234/abc"],
		]);
	});
});

describe("OpenAlex requests", () => {
	it("builds the search URL with dates, filters, sort, mailto and key", () => {
		const url = openalexUrl(
			{ apiKey: " k123 ", email: "me@example.org", filter: "is_oa:true, type:article" },
			{ q: "coral bleaching", from: "2015", to: "2020-06-30", sorting: "most-cited" },
			"*",
			100,
		);
		const p = params(url);
		expect(url.startsWith("https://api.openalex.org/works?")).toBe(true);
		expect(p.get("search")).toBe("coral bleaching");
		expect(p.get("filter")).toBe(
			"from_publication_date:2015-01-01,to_publication_date:2020-06-30,is_oa:true,type:article",
		);
		expect(p.get("sort")).toBe("cited_by_count:desc");
		expect(p.get("per_page")).toBe("100");
		expect(p.get("cursor")).toBe("*");
		expect(p.get("mailto")).toBe("me@example.org");
		expect(p.get("api_key")).toBe("k123");
		expect(p.get("select")).toContain("abstract_inverted_index");
		expect(params(openalexUrl({ apiKey: "k" }, { q: "x" }, "*", 10, false)).has("api_key")).toBe(false);
	});

	it("searches title and abstract (or titles) with a filter, without commas", () => {
		expect(openalexFilter({ searchIn: "title_and_abstract" }, { q: "corals, heat" })).toBe(
			"title_and_abstract.search:corals  heat",
		);
		const url = openalexUrl({ searchIn: "title" }, { q: "reef", sorting: "most-recent" }, "*", 5);
		expect(params(url).has("search")).toBe(false);
		expect(params(url).get("filter")).toBe("title.search:reef");
		expect(params(url).get("sort")).toBe("publication_date:desc");
	});

	it("checks configs", () => {
		expect(checkOpenalexConfig({})).toEqual([]);
		expect(checkOpenalexConfig({ filter: "is_oa:true,type:article", email: "a@b.org" })).toEqual([]);
		expect(checkOpenalexConfig({ filter: "is_oa true" })[0]).toMatch(/not understood: is_oa true/);
		expect(checkOpenalexConfig({ email: "nope" })[0]).toMatch(/email/);
		expect(checkOpenalexConfig({ apiKey: "a b" })[0]).toMatch(/spaces/);
	});
});

describe("searchOpenalex", () => {
	it("pages with the cursor until the limit and makes a map", async () => {
		const f = fakeFetch([ok(page1), ok(page2)]);
		const result = await searchOpenalex({ limit: 30 }, { q: "coral bleaching" }, { fetch: f });
		expect(f.calls).toHaveLength(2);
		expect(params(f.calls[0].url).get("cursor")).toBe("*");
		expect(params(f.calls[0].url).get("per_page")).toBe("30");
		const next = JSON.parse(page1).meta.next_cursor;
		expect(params(f.calls[1].url).get("cursor")).toBe(next);
		expect(params(f.calls[1].url).get("per_page")).toBe("10");
		expect(result).toMatchObject({ service: "openalex", query: "coral bleaching", total: 4521 });
		expect(result.papers).toHaveLength(30);
		expect(result.partial).toBeUndefined();
		const map = buildOverviewMap(
			{ papers: result.papers, content: result.content, service: "openalex" },
			await loadDefaultResources(),
			{ taxonomySeparator: ";" },
		);
		expect(map.documents.length).toBe(result.papers.length);
		expect(new Set(map.documents.map((d) => d.area)).size).toBeGreaterThan(1);
	});

	it("stops when OpenAlex has no next page", async () => {
		const f = fakeFetch([ok(page2)]);
		const result = await searchOpenalex({}, { q: "coral bleaching" }, { fetch: f });
		expect(f.calls).toHaveLength(1);
		expect(result.papers).toHaveLength(14);
	});

	it("waits out a short rate limit once", async () => {
		const f = fakeFetch([err(429, "{}", { "Retry-After": "0" }), ok(page2)]);
		const result = await searchOpenalex({}, { q: "x" }, { fetch: f });
		expect(f.calls).toHaveLength(2);
		expect(result.papers.length).toBeGreaterThan(0);
	});

	it("explains a spent daily budget and suggests a key", async () => {
		const f = fakeFetch([err(429, read("rate-limit-429.json"), { "Retry-After": "19832" })]);
		const e = await searchOpenalex({}, { q: "x" }, { fetch: f }).catch((x) => x);
		expect(e).toBeInstanceOf(SourceError);
		expect(e.reasons).toEqual([OPENALEX_REASONS.rateLimited]);
		expect(e.message).toMatch(/Try again in 6 hours/);
		expect(e.message).toMatch(/add a free key/);
		const keyed = await searchOpenalex(
			{ apiKey: "k" },
			{ q: "x" },
			{ fetch: fakeFetch([err(429, "{}", { "Retry-After": "60" })]), ...fast },
		).catch((x) => x);
		expect(keyed.message).not.toMatch(/add a free key/);
	});

	it("keeps the pages it has when a later one fails", async () => {
		const f = fakeFetch([ok(page1), err(429, "{}")]);
		const result = await searchOpenalex({ limit: 200 }, { q: "x" }, { fetch: f, ...fast });
		expect(result.papers).toHaveLength(20);
		expect(result.partial).toMatch(/too many requests/);
	});

	it("turns OpenAlex's errors into reasons", async () => {
		const bad = await searchOpenalex(
			{ filter: "nonsense:1" },
			{ q: "x" },
			{
				fetch: fakeFetch([
					err(400, '{"error":"Invalid query parameters error.","message":"nonsense is not a valid field"}'),
				]),
			},
		).catch((x) => x);
		expect(bad.reasons).toEqual([OPENALEX_REASONS.queryError]);
		expect(bad.message).toMatch(/nonsense is not a valid field/);

		const key = await searchOpenalex({ apiKey: "wrong" }, { q: "x" }, { fetch: fakeFetch([err(401, "{}")]) }).catch(
			(x) => x,
		);
		expect(key.message).toMatch(/check the source's API key/);

		const down = await searchOpenalex(
			{},
			{ q: "x" },
			{ fetch: fakeFetch([err(503, "<html>down</html>"), err(503, "<html>down</html>")]), attempts: 2 },
		).catch((x) => x);
		expect(down.reasons).toEqual([OPENALEX_REASONS.unreachable]);

		const net = await searchOpenalex(
			{},
			{ q: "x" },
			{ fetch: fakeFetch([new TypeError("Failed to fetch")]), attempts: 1 },
		).catch((x) => x);
		expect(net.reasons).toEqual([OPENALEX_REASONS.unreachable]);

		const garbled = await searchOpenalex({}, { q: "x" }, { fetch: fakeFetch([ok("<html>hi</html>")]) }).catch((x) => x);
		expect(garbled.reasons).toEqual([OPENALEX_REASONS.badResponse]);

		const empty = await searchOpenalex({}, { q: "  " }, { fetch: fakeFetch([]) }).catch((x) => x);
		expect(empty.reasons).toEqual([OPENALEX_REASONS.queryError]);
	});

	it("gives up on a slow answer", async () => {
		const slow: FetchFn = (_url, init) =>
			new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
		const e = await searchOpenalex({}, { q: "x" }, { fetch: slow, timeoutMs: 10 }).catch((x) => x);
		expect(e.reasons).toEqual([OPENALEX_REASONS.timeout]);
	});
});
