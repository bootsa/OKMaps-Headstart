/**
 * End-to-end parity: the map the app makes from recorded provider answers,
 * against the map today's server makes from the same answers (legacy/*.json.gz,
 * made by legacy_maps.R and legacy_finish.py from the server's own R and
 * Python code).
 *
 * Compared: the documents, every field of every document, which papers share
 * an area, the area titles, and the layout. Differences that are known and
 * intended are listed in KNOWN with the reason; anything else fails.
 * A summary is written to test-results/parity.md.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadDefaultResources } from "../../../pipeline/src/index.js";
import { procrustesSS } from "../../../pipeline/src/layout/mds.js";
import { buildMap, type SearchRequest } from "../../src/search.ts";
import { GATEWAY, fakeFetch } from "../fake-net.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
type Doc = Record<string, unknown>;

const REQUESTS: Record<string, SearchRequest> = {
  pubmed: { service: "pubmed", q: "ecology", from: "1809-01-01", to: "2026-11-06", sorting: "most-relevant" },
  base: { service: "base", q: "digital education", from: "1665-01-01", to: "2026-11-06", sorting: "most-relevant", document_types: ["121"] },
  openaire: { service: "openaire", project_id: "643410", funder: "EC" },
};

/** Fields that differ on purpose, per service ("*" for all), with the reason. */
const KNOWN: Record<string, Record<string, string>> = {
  "*": {
    x: "layout: compared by shape below (R's metaMDS starts at random)",
    y: "layout: compared by shape below",
    area_uri: "area numbers are arbitrary; the grouping is compared below",
  },
  pubmed: {
    content: "clustering text; the server leaves it in the record, the app keeps it out (vis/ does not read it)",
    id1: "internal PubMed parsing column, not read by vis/",
    id2: "internal PubMed parsing column, not read by vis/",
    readers: 'the server sends the PMC citation count as a string ("3"), the app as a number; vis/ reads both',
  },
  base: {
    keywords_rank_mesh_specific: "only used by R's ranking modes 1-3 (off in production), not read by vis/",
    keywords_rank_mesh_generic: "only used by R's ranking modes 1-3 (off in production), not read by vis/",
    additional_dois: "a list on the server (pandas), a string in the app; vis/ does not read it",
    relations: "{} on the server when empty, null in the app; vis/ does not read it",
  },
  openaire: {
    area: "R bug: when every area has the same number of candidate terms, apply() turns the list into an unnamed matrix and all titles come from the title/abstract fallback; the app titles them from the keywords",
    cluster_labels: "same as area",
  },
};

const known = (service: string, field: string) => KNOWN["*"][field] ?? KNOWN[service]?.[field];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Adjusted Rand index of two labellings. */
function ari(a: unknown[], b: unknown[]): number {
  const n = a.length;
  const c2 = (x: number) => (x * (x - 1)) / 2;
  const count = (keys: string[]) => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
  const pairs = [...count(a.map((x, i) => `${x}\u0000${b[i]}`)).values()].reduce((s, v) => s + c2(v), 0);
  const sa = [...count(a.map(String)).values()].reduce((s, v) => s + c2(v), 0);
  const sb = [...count(b.map(String)).values()].reduce((s, v) => s + c2(v), 0);
  const expected = (sa * sb) / c2(n);
  const max = (sa + sb) / 2;
  return max === expected ? 1 : (pairs - expected) / (max - expected);
}

/** Share of each paper's k nearest neighbours that are the same in both layouts. */
function knnOverlap(a: Array<[number, number]>, b: Array<[number, number]>, k: number): number {
  const nn = (p: Array<[number, number]>, i: number) =>
    p
      .map(([x, y], j) => [j, (x - p[i][0]) ** 2 + (y - p[i][1]) ** 2] as const)
      .filter(([j]) => j !== i)
      .sort((u, v) => u[1] - v[1])
      .slice(0, k)
      .map(([j]) => j);
  let shared = 0;
  for (let i = 0; i < a.length; i++) {
    const s = new Set(nn(b, i));
    shared += nn(a, i).filter((j) => s.has(j)).length;
  }
  return shared / (a.length * k);
}

const report: string[] = ["# Parity with the current server", "", "Recorded provider answers, made into maps by the app and by the server's own R and Python code.", ""];

afterAll(() => {
  const out = path.resolve(here, "../../test-results");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "parity.md"), report.join("\n") + "\n");
});

describe.each(Object.keys(REQUESTS))("%s", (service) => {
  const legacy = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(here, "legacy", `${service}.json.gz`))).toString("utf8")) as {
    documents: Doc[];
    documents_b: Doc[];
  };
  let app: Map<string, Doc>;
  const ids = legacy.documents.map((d) => String(d.id));
  const pick = (m: Map<string, Doc>, f: string) => ids.map((id) => m.get(id)?.[f]);
  const lg = new Map(legacy.documents.map((d) => [String(d.id), d]));
  const lgB = new Map(legacy.documents_b.map((d) => [String(d.id), d]));
  const lines: string[] = [`## ${service}`, ""];

  it("has the same documents", async () => {
    const map = await buildMap(REQUESTS[service], { gatewayUrl: GATEWAY, fetch: fakeFetch }, loadDefaultResources);
    app = new Map(map.documents.map((d) => [String(d.id), d]));
    expect([...app.keys()].sort()).toEqual([...ids].sort());
    lines.push(`- ${ids.length} documents, the same in both`);
  });

  it("has the same fields and values, apart from the known differences", () => {
    const fields = new Set([...legacy.documents, ...app.values()].flatMap((d) => Object.keys(d)));
    const unexpected: string[] = [];
    const differing: string[] = [];
    for (const f of [...fields].sort()) {
      const diff = ids.filter((id) => !same(lg.get(id)![f], app.get(id)![f])).length;
      if (diff === 0) continue;
      differing.push(`\`${f}\` (${diff} of ${ids.length})`);
      if (!known(service, f)) {
        const id = ids.find((i) => !same(lg.get(i)![f], app.get(i)![f]))!;
        unexpected.push(`${f}: server ${JSON.stringify(lg.get(id)![f])} app ${JSON.stringify(app.get(id)![f])}`);
      }
    }
    lines.push(`- ${fields.size} fields; equal in every document except ${differing.join(", ") || "none"}`);
    for (const [f, why] of Object.entries({ ...KNOWN["*"], ...KNOWN[service] })) lines.push(`  - \`${f}\`: ${why}`);
    expect(unexpected).toEqual([]);
  });

  it("puts the same papers together", () => {
    const score = ari(pick(lg, "area"), pick(app, "area"));
    lines.push(`- areas: ${new Set(pick(lg, "area")).size} on the server, ${new Set(pick(app, "area")).size} in the app; same grouping (adjusted Rand index ${score.toFixed(3)})`);
    expect(score).toBeCloseTo(1, 10);
  });

  it("gives the same area titles", () => {
    const titles = ids.filter((id) => same(lg.get(id)!.area, app.get(id)!.area)).length;
    lines.push(`- area titles: ${titles} of ${ids.length} papers get the same title`);
    if (!known(service, "area")) expect(pick(app, "area")).toEqual(pick(lg, "area"));
  });

  it("lays the map out as R does, within R's own run-to-run variation", () => {
    const xy = (m: Map<string, Doc>) => ids.map((id) => [Number(m.get(id)!.x), Number(m.get(id)!.y)] as [number, number]);
    const [r1, r2, ts] = [xy(lg), xy(lgB), xy(app)];
    const k = Math.min(5, ids.length - 1);
    const rr = procrustesSS(r1, r2);
    const tr = Math.min(procrustesSS(ts, r1), procrustesSS(ts, r2));
    const knnR = knnOverlap(r1, r2, k);
    const knnT = Math.max(knnOverlap(ts, r1, k), knnOverlap(ts, r2, k));
    lines.push(`- layout: Procrustes difference app-vs-server ${tr.toFixed(3)}, server-vs-server ${rr.toFixed(3)}; ${k}-nearest-neighbour overlap app-vs-server ${(knnT * 100).toFixed(0)}%, server-vs-server ${(knnR * 100).toFixed(0)}%`, "");
    report.push(...lines);
    // Same shape: about as close to R as R's two runs are to each other. With a
    // handful of papers R's runs can agree exactly while a different, equally
    // good arrangement still differs a little, hence the floor. (The pipeline's
    // own tests compare layout stress with R on 21 maps: packages/pipeline/test/golden.)
    expect(tr).toBeLessThanOrEqual(Math.max(rr * 2, 0.25));
    expect(knnT).toBeGreaterThanOrEqual(knnR - 0.15);
  });
});
