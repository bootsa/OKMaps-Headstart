/**
 * Whole-map comparison with the R pipeline: keywords, casing vocabulary,
 * area titles and layout.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildOverviewMap } from "../../src/map.js";
import { layoutStress, procrustesSS } from "../../src/layout/mds.js";
import { loadDefaultResources, type PipelineResources } from "../../src/resources.js";
import type { Paper } from "../../src/types.js";
import { goldenNames, loadCase, loadGolden } from "./load.js";

let res: PipelineResources;
beforeAll(async () => {
  res = await loadDefaultResources();
});

describe.each(goldenNames())("%s", (name) => {
  const g = loadGolden(name);
  const c = loadCase(name);
  const run = () =>
    buildOverviewMap(
      {
        papers: c.metadata as unknown as Paper[],
        content: Object.fromEntries(c.text.map((t) => [t.id, t.content])),
        service: c.params.service,
      },
      res,
      { taxonomySeparator: ";" },
    );

  it("fills in the same keywords", () => {
    const m = run();
    expect(m.documents.map((d) => d.subject_is_heuristic)).toEqual(g.subject_is_heuristic);
    expect(m.documents.map((d) => d.subject)).toEqual(g.subject);
  });

  it("gives the same area titles", () => {
    const m = run();
    expect(m.numAreas).toBe(g.num_clusters);
    expect(m.documents.map((d) => d.area)).toEqual(g.labels);
  });

  it("lays the map out within R's own run-to-run variation", () => {
    const m = run();
    const ts = m.documents.map((d) => [d.x, d.y] as [number, number]);
    const ra = g.layout as Array<[number, number]>;
    const rb = g.layout_b as Array<[number, number]>;
    const n = g.ids.length;
    const D = new Float64Array(n * n);
    let k = 0;
    for (let j = 0; j < n; j++) for (let i = j + 1; i < n; i++) D[i * n + j] = D[j * n + i] = g.distances[k++];
    const rr = procrustesSS(ra, rb);
    const tsR = Math.min(procrustesSS(ts, ra), procrustesSS(ts, rb));
    const sR = Math.min(layoutStress(D, n, ra), layoutStress(D, n, rb));
    const sTs = layoutStress(D, n, ts);
    console.log(`${name}: procrustes ts-vs-R ${tsR.toFixed(3)} R-vs-R ${rr.toFixed(3)} | stress ts ${sTs.toFixed(4)} R ${sR.toFixed(4)}`);
    expect(sTs).toBeLessThanOrEqual(sR + 0.005);
  });
});
