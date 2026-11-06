import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPubmedTerm,
  parseEsummary,
  parsePubmedXml,
  searchPubmed,
  toPubmedRecords,
} from "../src/pubmed.js";
import { SourceError } from "../src/errors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const efetch = fs.readFileSync(path.join(here, "fixtures/pubmed_efetch.xml"), "utf8");
/** Output of test/golden/pubmed_golden.R (pubmed.R run on the same XML). */
const golden: Record<string, unknown>[] = JSON.parse(fs.readFileSync(path.join(here, "golden/pubmed_efetch.json"), "utf8"));

const esummary = JSON.stringify({
  header: { type: "esummary", version: "0.3" },
  result: {
    uids: ["39000001", "39000002", "39000003", "39000004", "39000005"],
    "39000001": { uid: "39000001", pmcrefcount: 12, articleids: [
      { idtype: "pubmed", idtypen: 1, value: "39000001" },
      { idtype: "doi", idtypen: 3, value: "10.1038/s41586-024-00001-1" },
      { idtype: "pmc", idtypen: 8, value: "PMC11000001" },
    ] },
    "39000002": { uid: "39000002", pmcrefcount: "", articleids: [{ idtype: "pubmed", idtypen: 1, value: "39000002" }] },
    "39000003": { uid: "39000003", pmcrefcount: 3, articleids: [] },
    "39000004": { uid: "39000004", articleids: [] },
    "39000005": { uid: "39000005", pmcrefcount: "", articleids: [] },
  },
});

describe("PubMed parsing", () => {
  it("matches pubmed.R on a saved EFetch response", () => {
    const { papers, content } = toPubmedRecords(parsePubmedXml(efetch));
    expect(papers).toHaveLength(golden.length);
    papers.forEach((p, i) => {
      const r = golden[i];
      for (const key of ["title", "pmid", "published_in", "paper_abstract", "date", "year", "id", "authors",
        "subject", "publication_type", "url", "doi", "subject_orig"]) {
        expect(p[key], `${p.id} ${key}`).toEqual(r[key]);
      }
      expect(content[p.id]).toEqual(r.content);
    });
  });

  it("reads PMC citation counts and PMC ids from ESummary", () => {
    const { papers } = toPubmedRecords(parsePubmedXml(efetch), parseEsummary(esummary));
    expect(papers.map((p) => [p.readers, p.pmcid])).toEqual([
      [12, "PMC11000001"], [0, ""], [3, ""], [0, ""], [0, ""],
    ]);
  });

  it("builds the search term like pubmed.R", () => {
    expect(buildPubmedTerm({ q: "climate \\change “heat”" })).toBe('climate change "heat" AND hasabstract');
    expect(buildPubmedTerm({ q: "x", article_types: ["review", "journal article"] })).toBe(
      'x (("review"[Publication Type] OR "journal article"[Publication Type])) AND hasabstract',
    );
  });

  it("reports an empty EFetch result", () => {
    expect(() => parsePubmedXml("<eFetchResult><ERROR>Empty result - nothing to do</ERROR></eFetchResult>"))
      .toThrow("No results retrieved.");
  });
});

/** A fetch that answers from a table of URL prefixes and records the calls. */
function fakeFetch(routes: [string, () => Response][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const route = routes.find(([prefix]) => url.includes(prefix));
    if (!route) throw new TypeError("Failed to fetch");
    return route[1]();
  };
  return { fn, calls };
}

describe("searchPubmed", () => {
  const esearch = JSON.stringify({ esearchresult: { count: "5", retmax: "5", webenv: "MCID_1", querykey: "1", idlist: [] } });

  it("runs ESearch, EFetch and ESummary and returns pipeline input", async () => {
    const { fn, calls } = fakeFetch([
      ["esearch.fcgi", () => new Response(esearch)],
      ["efetch.fcgi", () => new Response(efetch)],
      ["esummary.fcgi", () => new Response(esummary)],
    ]);
    const res = await searchPubmed(
      { q: "ecology", from: "2016-01-01", to: "2025-01-01", sorting: "most-relevant", limit: 100 },
      { fetch: fn, apiKey: "k" },
    );
    expect(res.papers.map((p) => p.id)).toEqual(["39000001", "39000002", "39000003", "39000004", "39000005"]);
    expect(Object.keys(res.content)).toHaveLength(5);
    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("term")).toBe("ecology AND hasabstract");
    expect(body.get("mindate")).toBe("2016/01/01");
    expect(body.get("maxdate")).toBe("2025/01/01");
    expect(body.get("sort")).toBe("relevance");
    expect(body.get("usehistory")).toBe("y");
    expect(calls[1].url).toContain("WebEnv=MCID_1");
    expect(calls[1].url).toContain("query_key=1");
    expect(calls[2].url).toContain("retmode=json");
  });

  it("leaves sorting to PubMed for most-recent", async () => {
    const { fn, calls } = fakeFetch([
      ["esearch.fcgi", () => new Response(esearch)],
      ["efetch.fcgi", () => new Response(efetch)],
      ["esummary.fcgi", () => new Response(esummary)],
    ]);
    await searchPubmed({ q: "ecology", sorting: "most-recent" }, { fetch: fn, apiKey: "k" });
    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.has("sort")).toBe(false);
    expect(body.has("mindate")).toBe(false);
  });

  it("gives the R error codes", async () => {
    const zero = JSON.stringify({ esearchresult: { count: "0", idlist: [] } });
    const run = (routes: [string, () => Response][], params = {}) =>
      searchPubmed({ q: "x", ...params }, { fetch: fakeFetch(routes).fn, apiKey: "k", retryDelayMs: 0 }).catch((e) => e);

    const empty = await run([["esearch", () => new Response(zero)]], { from: "2025-01-01", to: "2025-02-01" });
    expect(empty).toBeInstanceOf(SourceError);
    expect(empty.reasons).toEqual(["timeframe too short"]);

    const none = await run([["esearch", () => new Response(zero)]]);
    expect(none.reasons).toEqual(["not enough results"]);

    const down = await run([]);
    expect(down.reasons).toEqual(["API error: PubMed not reachable"]);

    const big = await run([["esearch", () => new Response("error forwarding request", { status: 500 })]]);
    expect(big.reasons).toEqual([
      "API error: requested metadata size",
      "API error: PubMed not reachable",
      "unexpected PubMed API error",
    ]);

    const bad = await run([["esearch", () => new Response("bad", { status: 400 })]]);
    expect(bad.reasons).toEqual(["unexpected PubMed API error"]);
  });
});
