import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOverviewMap, loadDefaultResources } from "@okmaps/pipeline";
import { describe, expect, it } from "vitest";
import {
	checkZenodoConfig,
	communityId,
	type FetchFn,
	htmlText,
	SourceError,
	searchZenodo,
	toZenodoRecord,
	ZENODO_REASONS,
	type ZenodoHit,
	zenodoErrorMessage,
	zenodoPage,
	zenodoRetryMs,
	zenodoSearchUrl,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, "fixtures/zenodo", p), "utf8");
const coral = JSON.parse(read("coral-reef-datasets.json")) as { hits: { hits: ZenodoHit[]; total: number } };

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
		if (!a) throw new Error(`unexpected request ${url}`);
		if (a instanceof Error) throw a;
		return typeof a === "function" ? a(call) : a;
	}) as FetchFn & { calls: Call[] };
	f.calls = calls;
	return f;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});

/** A page of `n` made-up hits, ids from `from`. */
const page = (from: number, n: number, total: number, headers: Record<string, string> = {}) =>
	json(
		{
			hits: {
				total,
				hits: Array.from({ length: n }, (_, i) => ({ id: from + i, metadata: { title: `Record ${from + i}` } })),
			},
		},
		200,
		headers,
	);

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

const errorOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return e as SourceError;
	}
	throw new Error("expected a failure");
};

describe("htmlText", () => {
	it("drops tags and decodes entities", () => {
		expect(htmlText("<p>Allele &gt;11 loci &amp; P&lt;0.01</p><p>Second&nbsp;para &#8211; &#x2014; ok</p>")).toBe(
			"Allele >11 loci & P<0.01 Second para – — ok",
		);
		expect(htmlText("a<br/>b<script>alert(1)</script>")).toBe("a b");
		expect(htmlText("&unknown; stays")).toBe("&unknown; stays");
	});
});

describe("toZenodoRecord", () => {
	it("maps a real search hit", () => {
		const r = toZenodoRecord(coral.hits.hits[0]);
		expect(r).toMatchObject({
			id: "4963256",
			title:
				"Data from: High gene flow across large geographic scales reduces extinction risk for a highly specialised coral feeding butterflyfish",
			authors: "Lawton, Rebecca J.; Messmer, Vanessa; Pratchett, Morgan S.; Bay, Line K.",
			year: "2011-06-21",
			doi: "10.5061/dryad.4m80r",
			url: "https://zenodo.org/records/4963256",
			oa_state: 1,
			resulttype: ["Dataset"],
			subject: "Chaetodon trifascialis; Chaetodontidae; specialisation; Population connectivity; Chaetodon lunulatus",
		});
		expect(r.paper_abstract).toContain("(all P<0.01)");
		expect(r.paper_abstract).not.toMatch(/<\/?p>|&gt;/);
	});

	it("copes with sparse hits and split keywords", () => {
		const r = toZenodoRecord(
			{
				id: 7,
				metadata: {
					keywords: ["a; b", "b"],
					subjects: [{ subject: "c" }],
					access_right: "restricted",
					journal: { title: "J" },
				},
			},
			"https://sandbox.zenodo.org",
		);
		expect(r).toMatchObject({
			id: "7",
			title: null,
			paper_abstract: null,
			subject: "a; b; c",
			authors: "",
			year: null,
			published_in: "J",
			url: "https://sandbox.zenodo.org/records/7",
			oa_state: 0,
			resulttype: [],
		});
	});
});

describe("config", () => {
	it("reads a community id from a URL", () => {
		expect(communityId("https://zenodo.org/communities/dryad/records?q=x")).toBe("dryad");
		expect(communityId(" dryad ")).toBe("dryad");
	});

	it("reports unusable configs", () => {
		expect(checkZenodoConfig({})).toEqual([]);
		expect(checkZenodoConfig({ baseUrl: "nope" })).toHaveLength(1);
		expect(checkZenodoConfig({ community: "two words" })).toHaveLength(1);
		expect(checkZenodoConfig({ subtype: "article" })).toEqual(["A subtype needs a resource type."]);
	});

	it("builds search URLs", () => {
		const u = zenodoSearchUrl(
			{ community: "dryad", type: "publication", subtype: "article", filter: "access_status:open" },
			"coral reef",
			2,
			25,
		);
		expect(u.startsWith("https://zenodo.org/api/communities/dryad/records?")).toBe(true);
		expect(params(u)).toEqual({
			q: "(coral reef) AND (access_status:open)",
			sort: "bestmatch",
			size: "25",
			page: "2",
			type: "publication",
			subtype: "article",
		});
		// Without search terms: the newest records.
		expect(params(zenodoSearchUrl({ baseUrl: "https://sandbox.zenodo.org/", community: "x" }, "", 1, 10))).toEqual({
			sort: "newest",
			size: "10",
			page: "1",
		});
	});
});

describe("zenodoPage", () => {
	const URL1 = "https://zenodo.org/api/records?q=x";

	it("sends a token in the Authorization header only", async () => {
		const f = fakeFetch([json(coral, 200, { "X-RateLimit-Remaining": "99", "X-RateLimit-Reset": "1794162051" })]);
		const res = await zenodoPage(URL1, "secret", { fetch: f });
		expect(res.total).toBe(coral.hits.total);
		expect(res.remaining).toBe(99);
		expect(res.resetAt).toBe(1794162051000);
		expect((f.calls[0].init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer secret");
		expect(f.calls[0].url).not.toContain("secret");
		const g = fakeFetch([json(coral)]);
		await zenodoPage(URL1, undefined, { fetch: g });
		expect((g.calls[0].init?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
	});

	it("explains Zenodo's errors", async () => {
		const bad = await errorOf(
			zenodoPage(URL1, undefined, { fetch: fakeFetch([json(read("page-size-400.json"), 400)]) }),
		);
		expect(bad.reasons).toEqual([ZENODO_REASONS.queryError]);
		expect(bad.message).toContain("Page size cannot be greater than 25");
		const missing = await errorOf(
			zenodoPage("https://zenodo.org/api/communities/nope/records", undefined, {
				fetch: fakeFetch([json(read("community-404.json"), 404)]),
			}),
		);
		expect(missing.reasons).toEqual([ZENODO_REASONS.notFound]);
		const token = await errorOf(zenodoPage(URL1, "t", { fetch: fakeFetch([json({ message: "Unauthorized" }, 401)]) }));
		expect(token.reasons).toEqual([ZENODO_REASONS.tokenRefused]);
		const down = await errorOf(
			zenodoPage(URL1, undefined, {
				fetch: fakeFetch([new TypeError("Failed to fetch"), new TypeError("Failed to fetch")]),
				attempts: 2,
			}),
		);
		expect(down).toBeInstanceOf(SourceError);
		expect(down.reasons).toEqual([ZENODO_REASONS.unreachable]);
		const block = await errorOf(
			zenodoPage(URL1, undefined, {
				fetch: fakeFetch([new Response("<html><h1>403 Forbidden</h1>unusual traffic</html>", { status: 403 })]),
			}),
		);
		expect(block.reasons).toEqual([ZENODO_REASONS.unreachable]);
		expect(block.message).toContain("unusual traffic");
		const html = await errorOf(zenodoPage(URL1, undefined, { fetch: fakeFetch([new Response("<html>oops</html>")]) }));
		expect(html.reasons).toEqual([ZENODO_REASONS.badResponse]);
	});

	it("waits out a short rate limit, fails on a long one", async () => {
		const f = fakeFetch([json({ message: "Too many" }, 429, { "Retry-After": "0" }), json(coral)]);
		expect((await zenodoPage(URL1, undefined, { fetch: f })).hits).toHaveLength(5);
		const long = await errorOf(
			zenodoPage(URL1, undefined, {
				fetch: fakeFetch([json({}, 429, { "Retry-After": "120" })]),
				maxRetryWaitMs: 1000,
			}),
		);
		expect(long.reasons).toEqual([ZENODO_REASONS.rateLimited]);
		expect(long.message).toContain("120 seconds");
	});

	it("reads wait times and error bodies", () => {
		expect(zenodoRetryMs(new Headers({ "Retry-After": "59" }))).toBe(59_000);
		expect(zenodoRetryMs(new Headers({ "X-RateLimit-Reset": "100" }), 40_000)).toBe(60_000);
		expect(zenodoRetryMs(new Headers())).toBeNull();
		expect(zenodoErrorMessage(read("page-size-400.json"))).toMatch(/^A validation error occurred\. Page size/);
	});
});

describe("searchZenodo", () => {
	it("pages through results up to the limit, 25 at a time without a token", async () => {
		const f = fakeFetch([page(1, 25, 1000), page(26, 25, 1000), page(51, 25, 1000)]);
		const r = await searchZenodo({ limit: 60 }, { q: "coral" }, { fetch: f });
		expect(r.papers).toHaveLength(60);
		expect(r.total).toBe(1000);
		expect(f.calls.map((c) => params(c.url).page)).toEqual(["1", "2", "3"]);
		expect(params(f.calls[0].url).size).toBe("25");
		expect(r.content["1"]).toBe("Record 1");
	});

	it("asks for 100 per page with a token, and stops at the last page", async () => {
		const f = fakeFetch([page(1, 100, 130), page(101, 30, 130)]);
		const r = await searchZenodo({ limit: 500, accessToken: " t " }, { q: "coral" }, { fetch: f });
		expect(r.papers).toHaveLength(130);
		expect(params(f.calls[0].url).size).toBe("100");
	});

	it("drops records seen on an earlier page", async () => {
		const f = fakeFetch([page(1, 25, 40), page(20, 20, 40)]);
		const r = await searchZenodo({}, { q: "x" }, { fetch: f });
		expect(r.papers.map((p) => p.id)).toEqual(Array.from({ length: 39 }, (_, i) => String(i + 1)));
	});

	it("keeps what came when the rate limit window is far off", async () => {
		const reset = String(Math.ceil(Date.now() / 1000) + 3600);
		const f = fakeFetch([page(1, 25, 1000, { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": reset })]);
		const r = await searchZenodo({ limit: 100 }, { q: "x" }, { fetch: f, maxRetryWaitMs: 1000 });
		expect(r.papers).toHaveLength(25);
	});

	it("needs search terms or a community", async () => {
		const e = await errorOf(searchZenodo({}, { q: " " }, { fetch: fakeFetch([]) }));
		expect(e.reasons).toEqual([ZENODO_REASONS.queryError]);
		const f = fakeFetch([page(1, 3, 3)]);
		expect((await searchZenodo({ community: "dryad" }, { q: "" }, { fetch: f })).papers).toHaveLength(3);
	});

	it("feeds the map pipeline", async () => {
		const f = fakeFetch([json(coral)]);
		const r = await searchZenodo({ type: "dataset", limit: 5 }, { q: "coral reef" }, { fetch: f });
		const map = buildOverviewMap(
			{ papers: r.papers, content: r.content, service: "zenodo" },
			await loadDefaultResources(),
		);
		expect(map.documents).toHaveLength(5);
	});
});
