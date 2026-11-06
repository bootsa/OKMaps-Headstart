/**
 * Area titles: port of create_cluster_labels() (summarize.R) for the default
 * configuration (ranking mode 0, n-gram setting 0), which is what production
 * runs when RANKING_MODE / NGRAM_SETTING are unset.
 */
import { normalizeCorpusTokens, stripMajorTopicMarkers } from "../text/hygiene.js";
import { filterOutNestedNgrams, legacyPruneQuirks, ngramCandidates } from "../text/ngrams.js";
import { capitalizeFirst, pasteRecycled, rLower, rStrsplit, sortDecreasing, table, trim, trimws } from "../text/rstring.js";
import type { Stopwords } from "../text/stopwords.js";
import { scanTokens } from "../features/corpus.js";
import { termDocumentMatrix } from "../features/tdm.js";
import type { CasingVocabulary } from "./casing.js";

export interface LabelPaper {
  title: string | null;
  abstract: string | null;
  /** Keywords after replaceKeywordsIfEmpty, "; "-separated. */
  subject: string | null;
}

export interface AreaLabelOptions {
  topN?: number;
  /** Subjects containing this separator keep only their last path segment (R default from the worker: ";"). */
  taxonomySeparator?: string | null;
  labelExclusions?: string[];
}

/** SplitTokenizer: whitespace tokens split on ";" (trailing empty pieces dropped, as strsplit does). */
const splitTokenizer = (x: string): string[] =>
  scanTokens(x).flatMap((w) => rStrsplit(w, ";"));

/** Per-cluster corpus document for mode 0 (get_cluster_corpus_legacy). */
function legacyClusterDocument(papers: LabelPaper[], stops: Stopwords, taxonomySeparator: string | null): string {
  const titles = papers.map((p) => p.title);
  const titleNgrams: string[] = [];
  for (const n of [2, 3]) {
    const perTitle = legacyPruneQuirks(titles.map((t) => ngramCandidates(t, stops, [n])), stops);
    for (const grams of perTitle) titleNgrams.push(grams.join(";"));
  }
  const subjects = papers.map((p) => {
    // NA subjects become the string "NA" in R; the token is later dropped as too short
    let s = p.subject == null ? "NA" : p.subject.replace(/; /g, ";").replace(/ /g, "_");
    if (taxonomySeparator != null) {
      const toks = rStrsplit(s, ";");
      const keep = toks.filter((t) => !t.includes(taxonomySeparator));
      const taxons = toks.filter((t) => t.includes(taxonomySeparator)).map((t) => {
        const parts = rStrsplit(t, taxonomySeparator);
        return parts[parts.length - 1] ?? "";
      });
      s = `${keep.join(";")} ${taxons.join(";")}`;
    }
    return s;
  });
  return normalizeCorpusTokens(pasteRecycled(subjects, titleNgrams, " "));
}

/** tf-idf (SMART "ntn") per cluster: terms with positive weight, highest first, ties in term order. */
function tfidfTop(docs: string[], minTf: number): Array<Array<[string, number]>> {
  const tdm = termDocumentMatrix(docs, { tokenize: splitTokenizer, tolower: true, localBounds: [minTf, Infinity] });
  const N = docs.length;
  const df = new Map<string, number>();
  for (const m of tdm.docs) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  return tdm.docs.map((m) => {
    const col = tdm.terms.map((t) => {
      const tf = m.get(t) ?? 0;
      const idf = Math.log2(N / (df.get(t) ?? 1));
      return [t, tf ? tf * (Number.isFinite(idf) ? idf : 0) : 0] as [string, number];
    });
    return sortDecreasing(col, (x) => x[1]).filter((x) => x[1] > 0);
  });
}

function dropExcluded(terms: Array<[string, number]>, exclusions: Set<string>): Array<[string, number]> {
  if (!exclusions.size) return terms;
  return terms.filter(([t]) => !exclusions.has(trimws(rLower(t.replace(/_/g, " ")))));
}

/** another_prune_ngrams + get_top_names: the display label from ranked terms. */
function topNames(terms: string[], topN: number, stops: Stopwords): string {
  const kept = terms.filter((term) => {
    const toks = rStrsplit(term, "_");
    if (!toks.length) return false;
    const first = toks[0];
    const last = toks[toks.length - 1];
    if (!first || stops.isSubstringOfAny(first)) return false;
    if (!last || stops.isSubstringOfAny(last)) return false;
    return true;
  });
  const names = filterOutNestedNgrams(kept.map((t) => trim(t.replace(/_/g, " "))), topN);
  return names.map((x) => trim(capitalizeFirst(x))).join(", ");
}

/** Last resort: most frequent bi-/tri-grams of the cluster's titles and abstracts. */
function titleAbstractFallback(papers: LabelPaper[], stops: Stopwords, topN: number, exclusions: Set<string>): string {
  const candidates = papers.flatMap((p) =>
    ngramCandidates(rLower(`${p.title ?? "NA"} ${p.abstract ?? "NA"}`), stops, [2, 3]),
  );
  if (!candidates.length) return "";
  let ranked = sortDecreasing(table(candidates), (x) => x[1]).map((x) => x[0]);
  if (exclusions.size) ranked = ranked.filter((t) => !exclusions.has(trimws(rLower(t.replace(/_/g, " ")))));
  return filterOutNestedNgrams(ranked, topN).map((x) => x.replace(/_/g, " ")).join(", ");
}

/**
 * One label per cluster (index k-1 for cluster k), casing restored.
 * `groups` holds the 1-based cluster id of each paper.
 */
export function createAreaLabels(
  papers: LabelPaper[],
  groups: number[],
  numClusters: number,
  stops: Stopwords,
  vocabulary: CasingVocabulary,
  opts: AreaLabelOptions = {},
): string[] {
  const topN = opts.topN ?? 3;
  const sep = opts.taxonomySeparator === undefined ? ";" : opts.taxonomySeparator;
  const exclusions = new Set((opts.labelExclusions ?? []).map((x) => rLower(trimws(x))));
  const prepared = papers.map((p) => ({ ...p, subject: p.subject == null ? null : stripMajorTopicMarkers(p.subject) }));
  const members: LabelPaper[][] = Array.from({ length: numClusters }, () => []);
  groups.forEach((g, i) => members[g - 1].push(prepared[i]));

  const docs = members.map((m) => legacyClusterDocument(m, stops, sep));
  let top = tfidfTop(docs, 2);
  const empty = top.map((t) => t.reduce((s, x) => s + x[1], 0) === 0);
  if (empty.some(Boolean)) {
    const refill = tfidfTop(docs, 1);
    top = top.map((t, k) => (empty[k] ? refill[k] : t));
  }
  return top.map((t, k) => {
    let label = topNames(dropExcluded(t, exclusions).map((x) => x[0]), topN, stops);
    if (label === "") label = titleAbstractFallback(members[k], stops, topN, exclusions);
    return vocabulary.fixLabel(label);
  });
}
