import { describe, expect, it } from "vitest";
import { loadDefaultResources } from "../../pipeline/src/index.js";
import { buildMap, timestamp, type SearchRequest, type Stage } from "../src/search.ts";
import { GATEWAY, fakeFetch } from "./fake-net.ts";

const settings = { gatewayUrl: GATEWAY, fetch: fakeFetch, crossrefMailto: "maps@example.org" };
const NOW = new Date(2026, 10, 6, 9, 5, 3);

async function make(request: SearchRequest) {
  const stages: Stage[] = [];
  const map = await buildMap(request, settings, loadDefaultResources, (s) => stages.push(s), NOW);
  return { map, stages };
}

function expectLaidOut(docs: Record<string, unknown>[]) {
  expect(docs.length).toBeGreaterThan(0);
  for (const d of docs) {
    expect(Number.isFinite(Number(d.x)) && Number.isFinite(Number(d.y))).toBe(true);
    expect(typeof d.x).toBe("string");
    expect(d.area).toBeTruthy();
  }
}

describe("buildMap", () => {
  it("makes a PubMed map with Crossref citation counts", async () => {
    const { map, stages } = await make({ service: "pubmed", q: "ecology", from: "2016-01-01", to: "2025-01-01", sorting: "most-relevant" });
    expect(stages).toEqual(["searching", "citations", "layout"]);
    expect(map.context).toMatchObject({ query: "ecology", service: "pubmed", timestamp: "2026-11-06 09:05:03" });
    expect(JSON.parse(map.context.params)).toEqual({ from: "2016-01-01", to: "2025-01-01", sorting: "most-relevant", article_types: [] });
    expectLaidOut(map.documents);
    const withDoi = map.documents.filter((d) => d.doi);
    expect(withDoi.length).toBeGreaterThan(0);
    for (const d of withDoi) expect(typeof d.citation_count).toBe("number");
  });

  it("makes a BASE map through the gateway", async () => {
    const { map, stages } = await make({
      service: "base",
      q: "digital education",
      from: "1665-01-01",
      to: "2024-01-01",
      sorting: "most-relevant",
      document_types: ["121"],
    });
    expect(stages).toEqual(["searching", "layout"]);
    expect(map.documents.length).toBeGreaterThan(50);
    expectLaidOut(map.documents);
  });

  it("makes an OpenAIRE project map with the project details in the context", async () => {
    const { map } = await make({ service: "openaire", project_id: "643410", funder: "EC" });
    expectLaidOut(map.documents);
    const params = JSON.parse(map.context.params);
    expect(params).toMatchObject({ project_id: "643410", funder: "EC", acronym: "OpenAIRE2020" });
    expect(params.organisations).toHaveLength(3);
  });

  it("reports provider errors with their reasons", async () => {
    const err = await buildMap(
      { service: "openaire", project_id: "1", funder: "EC" },
      { gatewayUrl: GATEWAY, fetch: async () => new Response("<response><results/></response>") },
      loadDefaultResources,
    ).catch((e) => e);
    expect(err.reasons).toEqual(["project id or funder id wrong"]);
  });
});

it("formats timestamps like the server", () => {
  expect(timestamp(new Date(2020, 0, 2, 3, 4, 5))).toBe("2020-01-02 03:04:05");
});
