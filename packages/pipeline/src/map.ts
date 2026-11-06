/**
 * Build an overview map from papers: port of vis_layout() for vis_type
 * "overview" (vis_layout.R).
 */
import { createClusters } from "./cluster/clusters.js";
import { createCorpus } from "./features/corpus.js";
import { cosineDistances, termDocumentMatrix } from "./features/tdm.js";
import { createAreaLabels } from "./labels/areas.js";
import { CasingVocabulary, typeCounts } from "./labels/casing.js";
import { replaceKeywordsIfEmpty } from "./labels/keywords.js";
import { layoutMds } from "./layout/mds.js";
import type { PipelineResources } from "./resources.js";
import { rStrsplit, sortDecreasing, table } from "./text/rstring.js";
import { getStopwords } from "./text/stopwords.js";
import type { MapDocument, MapInput, MapOptions, MapResult, Paper } from "./types.js";

const MAX_ABSTRACT = 17000;

/** sanitize_abstract(): cut very long abstracts. */
function sanitizeAbstract(p: Paper): Paper {
  const a = p.paper_abstract;
  if (typeof a === "string" && Array.from(a).length > MAX_ABSTRACT) {
    return { ...p, paper_abstract: `${Array.from(a).slice(0, MAX_ABSTRACT).join("")} [...]` };
  }
  return p;
}

/** The two most frequent languages of the papers (ties in collation order). */
export function topLanguages(papers: Paper[]): string[] {
  const langs = papers.flatMap((p) => (typeof p.lang === "string" ? rStrsplit(p.lang, "; ") : []));
  return sortDecreasing(table(langs), (x) => x[1]).slice(0, 2).map((x) => x[0]);
}

export function buildOverviewMap(input: MapInput, resources: PipelineResources, opts: MapOptions = {}): MapResult {
  const papers = input.papers.map(sanitizeAbstract);
  const n = papers.length;
  if (n === 0) return { documents: [], numAreas: 0, stress: 0 };

  const stops = getStopwords(topLanguages(papers), resources.stopwords);
  const content = papers.map((p) => ({
    id: p.id,
    content: input.content?.[p.id] ?? `${p.title ?? ""} ${p.paper_abstract ?? ""}`,
  }));
  const corpus = createCorpus(content, stops);
  const D = cosineDistances(termDocumentMatrix(corpus.stemmed));
  const clusters = createClusters(D, n, opts.maxClusters ?? 15);
  const layout = layoutMds(D, n);

  const kw = replaceKeywordsIfEmpty(
    papers.map((p) => p.title ?? null),
    papers.map((p) => (p.subject === undefined ? null : (p.subject as string | null))),
    stops,
  );
  const vocabulary = new CasingVocabulary(
    typeCounts(
      new Map(corpus.ids.map((id, i) => [id, corpus.unlowered[i]])),
      papers.map((p, i) => ({
        id: p.id,
        title: p.title ?? null,
        keywords: "subject_orig" in p ? ((p.subject_orig as string | null) ?? null) : kw.subject[i],
      })),
    ),
  );
  const labels = createAreaLabels(
    papers.map((p, i) => ({ title: p.title ?? null, abstract: (p.paper_abstract as string | null) ?? null, subject: kw.subject[i] })),
    clusters.groups,
    clusters.numClusters,
    stops,
    vocabulary,
    { topN: opts.labelTerms ?? 3, taxonomySeparator: opts.taxonomySeparator, labelExclusions: resources.labelExclusions },
  );

  const areaIds = new Map<string, number>();
  const documents: MapDocument[] = papers.map((p, i) => {
    const area = labels[clusters.groups[i] - 1];
    if (!areaIds.has(area)) areaIds.set(area, areaIds.size + 1);
    return {
      ...p,
      subject: kw.subject[i],
      subject_is_heuristic: kw.subjectIsHeuristic[i],
      x: layout.x[i],
      y: layout.y[i],
      labels: p.id,
      cluster_labels: area,
      area,
      area_uri: areaIds.get(area)!,
    };
  });
  return { documents, numAreas: clusters.numClusters, stress: layout.stress };
}

/**
 * The records as the R pipeline serialises them (x, y and area_uri as
 * strings), for consumers that expect the legacy JSON exactly.
 */
export function toLegacyRecords(result: MapResult): Array<Record<string, unknown>> {
  return result.documents.map((d) => ({ ...d, x: String(d.x), y: String(d.y), area_uri: d.area_uri }));
}
