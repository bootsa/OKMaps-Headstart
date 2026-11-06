import { describe, expect, it } from "vitest";
import { addCitationCounts, fetchCitationCounts } from "../src/crossref.js";

/** A fake Crossref REST API holding the given counts (keys lowercase). */
function fakeCrossref(counts: Record<string, number>, failBatches = false) {
	const urls: string[] = [];
	const fetch = async (url: string) => {
		urls.push(url);
		const u = new URL(url);
		if (u.pathname === "/works") {
			if (failBatches) return new Response("busy", { status: 503 });
			const dois = u.searchParams
				.get("filter")!
				.split(",")
				.map((f) => f.replace(/^doi:/, ""));
			const items = dois.filter((d) => d in counts).map((d) => ({ DOI: d, "is-referenced-by-count": counts[d] }));
			return Response.json({ status: "ok", message: { items } });
		}
		const doi = decodeURIComponent(u.pathname.replace(/^\/works\//, ""));
		if (!(doi in counts)) return new Response("Resource not found.", { status: 404 });
		return Response.json({ status: "ok", message: { DOI: doi, "is-referenced-by-count": counts[doi] } });
	};
	return { urls, fetch };
}

describe("Crossref citation counts", () => {
	it("adds citation_count by DOI, keeping order, with null for unknown or missing DOIs", async () => {
		const api = fakeCrossref({ "10.1/a": 5, "10.1/b": 0, "10.1/x,y": 7 });
		const papers = [
			{ id: "1", doi: "10.1/B" },
			{ id: "2", doi: "" },
			{ id: "3", doi: "10.1/a" },
			{ id: "4", doi: "10.1/unknown" },
			{ id: "5", doi: "10.1/x,y" },
			{ id: "6", doi: "10.1/a" },
		];
		const res = await addCitationCounts(papers, { fetch: api.fetch, mailto: "maps@example.org" });
		expect(res.map((p) => [p.id, p.citation_count])).toEqual([
			["1", 0],
			["2", null],
			["3", 5],
			["4", null],
			["5", 7],
			["6", 5],
		]);
		expect(api.urls).toEqual([
			"https://api.crossref.org/works?filter=doi%3A10.1%2Fb%2Cdoi%3A10.1%2Fa%2Cdoi%3A10.1%2Funknown&rows=3&select=DOI%2Cis-referenced-by-count&mailto=maps%40example.org",
			"https://api.crossref.org/works/10.1%2Fx%2Cy?mailto=maps%40example.org",
		]);
	});

	it("asks in batches", async () => {
		const counts = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`10.1/${i}`, i]));
		const api = fakeCrossref(counts);
		const res = await fetchCitationCounts(Object.keys(counts), { fetch: api.fetch, batchSize: 3 });
		expect(api.urls).toHaveLength(3);
		expect([...res.entries()].sort()).toEqual(Object.entries(counts).sort());
	});

	it("leaves counts empty when Crossref fails, as metrics.R does", async () => {
		const api = fakeCrossref({ "10.1/a": 5 }, true);
		const res = await addCitationCounts([{ doi: "10.1/a" }], { fetch: api.fetch, retryDelayMs: 0 });
		expect(res).toEqual([{ doi: "10.1/a", citation_count: null }]);
	});

	it("makes no request without DOIs", async () => {
		const api = fakeCrossref({});
		expect(await addCitationCounts([{ doi: "" }, { doi: null }], { fetch: api.fetch })).toEqual([
			{ doi: "", citation_count: null },
			{ doi: null, citation_count: null },
		]);
		expect(api.urls).toEqual([]);
	});
});
