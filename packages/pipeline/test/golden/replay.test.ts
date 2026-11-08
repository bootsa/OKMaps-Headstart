/**
 * Area titles on the R labelling replay fixtures
 * (server/preprocessing/other-scripts/test/replay), converted by
 * test/golden/r/convert_replay.R. These start from R's own clusters, keywords
 * and casing vocabulary, so they test the labeller on its own across BASE,
 * PubMed, ORCID and OpenAIRE maps.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAreaLabels } from "../../src/labels/areas.js";
import { CasingVocabulary } from "../../src/labels/casing.js";
import { Stopwords } from "../../src/text/stopwords.js";
import labelExclusions from "../../resources/label_exclusions.json";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "replay");
const read = (f: string) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString("utf8"));
const stopLists: string[][] = read("_stops.json.gz");
const names = fs
  .readdirSync(dir)
  .filter((f) => !f.startsWith("_"))
  .map((f) => f.replace(/\.json\.gz$/, ""))
  .sort();

describe.each(names)("%s", (name) => {
  it("gives the same area titles as R", () => {
    const fx = read(`${name}.json.gz`);
    const stops = new Stopwords(stopLists[fx.stops]);
    const papers = fx.title.map((t: string | null, i: number) => ({
      title: t,
      abstract: fx.paper_abstract[i],
      subject: fx.subject[i],
    }));
    const labels = createAreaLabels(
      papers,
      fx.groups,
      fx.num_clusters,
      stops,
      new CasingVocabulary(new Map(Object.entries(fx.type_counts as Record<string, number>))),
      { topN: fx.top_n, taxonomySeparator: fx.taxonomy_separator, labelExclusions },
    );
    const perPaper = fx.groups.map((g: number) => labels[g - 1]);
    expect(perPaper).toEqual(fx.labels);
  });
});
