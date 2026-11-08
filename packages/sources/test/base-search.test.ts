import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { searchBase } from "../src/base/index.js";
import { SourceError } from "../src/errors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const gz = (p: string) => zlib.gunzipSync(fs.readFileSync(path.join(here, p))).toString("utf8");
const providers = new Map<string, string>(
	JSON.parse(gz("fixtures/contentproviders.json.gz")).map((r: { name: string; internal_name: string }) => [
		r.name,
		r.internal_name,
	]),
);

const WORDS = [
	"soil",
	"river",
	"ocean",
	"forest",
	"climate",
	"urban",
	"health",
	"energy",
	"policy",
	"school",
	"music",
	"language",
	"protein",
	"galaxy",
	"market",
	"law",
];
/** A title that differs a lot from every other id's title. */
const titleFor = (id: string) => {
	let h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
	const words: string[] = [];
	for (let i = 0; i < 6; i++) {
		words.push(WORDS[h % WORDS.length]);
		h = Math.floor(h / WORDS.length) + i * 7919;
	}
	return `${words.join(" ")} ${id}`;
};

const page = (ids: string[], numFound: number) =>
	`<response><result name="response" numFound="${numFound}" start="0">${ids
		.map(
			(id) =>
				`<doc><str name="dcdocid">${id}</str><str name="dctitle">${titleFor(id)}</str>` +
				`<str name="dcdescription">About ${id}.</str><int name="dcoa">1</int><str name="dclink">https://example.org/${id}</str>` +
				`<arr name="dctypenorm"><str>121</str></arr></doc>`,
		)
		.join("")}</result></response>`;

function gateway(handler: (sp: URLSearchParams) => Response) {
	const calls: URLSearchParams[] = [];
	const fetch = async (url: string) => {
		const sp = new URL(url).searchParams;
		calls.push(sp);
		return handler(sp);
	};
	return { fetch, calls };
}

describe("searchBase", () => {
	it("gives the same result as the R and Python workers for one page", async () => {
		const xml = gz("fixtures/base/base_cancer_research.xml.gz");
		const { fetch, calls } = gateway(() => new Response(xml));
		const res = await searchBase(
			{
				q: "cancer research",
				from: "1665-01-01",
				to: "2024-01-01",
				document_types: ["121"],
				limit: 100,
				list_size: 100,
				vis_type: "overview",
			},
			{ endpoint: "https://gateway.example/base", fetch, contentProviders: providers, minIntervalMs: 0 },
		);
		expect(calls).toHaveLength(1);
		expect(calls[0].get("query")).toBe(
			"dcdate:[1665-01-01 TO 2024-01-01] (textus:cancer textus:research) dctypenorm:(121)",
		);
		const golden = JSON.parse(gz("golden/base_worker/base_cancer_research_overview.json.gz"));
		expect(res.papers.map((p) => p.id)).toEqual(golden.metadata.map((g: { id: string }) => g.id));
		expect(res.papers.map((p) => res.content[p.id])).toEqual(golden.text.map((t: { content: string }) => t.content));
	});

	it("fetches more pages while duplicates leave fewer than limit records", async () => {
		// Fixed-width ids: like the Python worker, grouping matches ids as substrings.
		const first = Array.from({ length: 120 }, (_, i) => `a${String(i).padStart(3, "0")}`);
		const second = Array.from({ length: 30 }, (_, i) => `b${String(i).padStart(3, "0")}`);
		const { fetch, calls } = gateway((sp) => new Response(page(sp.get("offset") === "0" ? first : second, 150)));
		const res = await searchBase(
			{ q: "x", from: "2000-01-01", to: "2020-01-01", document_types: ["121"], limit: 130, list_size: 200 },
			{ endpoint: "https://gateway.example/base?key=1", fetch, minIntervalMs: 0 },
		);
		expect(calls.map((c) => c.get("offset"))).toEqual(["0", "120"]);
		expect(calls[0].get("key")).toBe("1");
		expect(res.papers).toHaveLength(150);
		expect(res.papers.find((p) => p.id === "a000")?.relevance).toBe(150);
	});

	it("gives the R error codes", async () => {
		const run = (handler: () => Response, params = {}) =>
			searchBase(
				{ q: "x", document_types: ["121"], ...params },
				{ endpoint: "https://g/base", fetch: gateway(handler).fetch, minIntervalMs: 0, retryDelayMs: 0 },
			).catch((e) => e);
		const empty = await run(() => new Response(page([], 0)), { from: "2020-01-01", to: "2020-01-30" });
		expect(empty).toBeInstanceOf(SourceError);
		expect(empty.reasons).toEqual(["timeframe too short"]);
		const down = await run(() => new Response("oops", { status: 503 }));
		expect(down.reasons).toEqual(["BASE error: timeout"]);
	});
});
