import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { baseRequestParams, buildBaseRequest, preprocessQuery, sanitizeQuery, type BaseParams } from "../src/base/query.js";

const here = path.dirname(fileURLToPath(import.meta.url));
/** test/golden/r/base_query_golden.R: get_papers() in base.R up to the API call. */
const golden: { q: string; params: BaseParams; exact: string | null; request: Record<string, unknown> | null }[] = JSON.parse(
  fs.readFileSync(path.join(here, "golden/base_query.json"), "utf8"),
);

describe("BASE query building", () => {
  it(`matches preprocess_query on ${golden.length} queries`, () => {
    for (const c of golden) {
      if (c.exact === null) continue;
      expect(preprocessQuery(sanitizeQuery(c.q)), c.q).toBe(c.exact);
    }
  });

  it("builds the same request as get_papers", () => {
    for (const c of golden) {
      const req = buildBaseRequest({ ...c.params, q: c.q });
      const r = c.request!;
      expect(
        { query: req.query, hits: req.hits, offset: req.offset, fields: req.fields, sortby: req.sortby,
          filter: req.filter.replace(/ /g, "%20"), target: req.target, coll: req.coll, non_public: req.non_public },
        `${c.q} ${JSON.stringify(c.params)}`,
      ).toEqual(r);
    }
  });

  it("encodes the request for the API", () => {
    const sp = baseRequestParams(buildBaseRequest({ q: "a b", from: "2020-01-01", to: "2020-12-31", document_types: ["121"], repo: "fttriple" }));
    expect(sp.get("func")).toBe("PerformSearch");
    expect(sp.get("query")).toBe("dcdate:[2020-01-01 TO 2020-12-31] (textus:a textus:b) dctypenorm:(121)");
    expect(sp.get("filter")).toBe("descsize:[300 TO *]");
    expect(sp.get("target")).toBe("fttriple");
    expect(sp.get("triple")).toBe("1");
    expect(sp.has("coll")).toBe(false);
  });
});
