/**
 * Stage-by-stage comparison with the R pipeline on the known cases
 * (legacy/workers/tests/knowncases). Goldens come from
 * test/golden/r/generate_goldens.R.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createCorpus } from "../../src/features/corpus.js";
import { cosineDistances, termDocumentMatrix } from "../../src/features/tdm.js";
import { createClusters } from "../../src/cluster/clusters.js";
import { mergeMatrix } from "../../src/cluster/hclust.js";
import { getStopwords } from "../../src/text/stopwords.js";
import { loadDefaultResources, type PipelineResources } from "../../src/resources.js";
import { goldenNames, loadCase, loadGolden } from "./load.js";

let res: PipelineResources;
beforeAll(async () => {
  res = await loadDefaultResources();
});

describe.each(goldenNames())("%s", (name) => {
  const g = loadGolden(name);
  const c = loadCase(name);

  it("builds the same stemmed corpus, terms and distances", () => {
    const stops = getStopwords(g.languages ?? [], res.stopwords);
    expect(stops.list.length).toBe(g.stopword_count);
    const corpus = createCorpus(c.text, stops);
    expect(corpus.ids).toEqual(g.ids);
    for (let i = 0; i < g.stemmed.length; i++) expect(corpus.stemmed[i], `doc ${i}`).toBe(g.stemmed[i]);
    const tdm = termDocumentMatrix(corpus.stemmed);
    expect(tdm.terms).toEqual(g.terms);
    const n = g.ids.length;
    const D = cosineDistances(tdm);
    let k = 0;
    // R's dist() vector is the lower triangle by columns
    for (let j = 0; j < n; j++) for (let i = j + 1; i < n; i++) {
      expect(Math.abs(D[i * n + j] - g.distances[k]), `d(${i},${j})`).toBeLessThan(1e-7);
      k++;
    }
  });

  it("clusters the same way", () => {
    const n = g.ids.length;
    const stops = getStopwords(g.languages ?? [], res.stopwords);
    const D = cosineDistances(termDocumentMatrix(createCorpus(c.text, stops).stemmed));
    const cl = createClusters(D, n, 15);
    expect(mergeMatrix(cl.hclust)).toEqual(g.merge);
    cl.ev.forEach((v, i) => expect(Math.abs(v - g.ev[i])).toBeLessThan(1e-6));
    expect(cl.numClusters).toBe(g.num_clusters);
    expect(cl.groups).toEqual(g.groups);
  });
});
