/**
 * N-gram generation and pruning. Port of ngram_generation.R (shared generator,
 * Setting 0 legacy quirks, nested-n-gram filter).
 */
import { punctuationSegments } from "./hygiene.js";
import { rLower } from "./rstring.js";
import type { Stopwords } from "./stopwords.js";

/** NLP::ngrams + paste(collapse = "_") for one segment. */
function segmentNgrams(segment: string, n: number): string[] {
  const tokens = segment.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").split(" ");
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join("_"));
  return out;
}

const NUMERIC = /^[0-9]+([.,:-][0-9]+)*$/;

/**
 * Candidate n-grams of a text (ngram_candidates in R): per punctuation segment,
 * contiguous n-grams on the stopword-retaining token stream, dropping n-grams
 * that start or end with a stopword (case-insensitive) or start and end with
 * the same token. With unigrams, non-stopword non-numeric tokens come first.
 */
export function ngramCandidates(
  text: string | null | undefined,
  stops: Stopwords,
  ngramLengths: number[] = [2, 3],
  includeUnigrams = false,
): string[] {
  const unigrams = includeUnigrams || ngramLengths.includes(1);
  const lengths = ngramLengths.filter((n) => n !== 1);
  const segments = punctuationSegments(text);
  if (!segments.length) return [];
  const grams: string[] = [];
  for (const n of lengths) for (const seg of segments) grams.push(...segmentNgrams(seg, n));
  const out = grams.filter((g) => {
    if (!g) return false;
    const toks = g.split("_");
    const first = toks[0];
    const last = toks[toks.length - 1];
    return toks.length >= 2 && !stops.lowerSet.has(rLower(first)) && !stops.lowerSet.has(rLower(last)) && first !== last;
  });
  if (!unigrams) return out;
  const words: string[] = [];
  for (const seg of segments) for (const w of seg.split(" ")) {
    if (w && !stops.lowerSet.has(rLower(w)) && !NUMERIC.test(w)) words.push(w);
  }
  return words.concat(out);
}

/**
 * Setting-0 emulation of the legacy prune quirks: an n-gram is dropped when an
 * edge token occurs as a substring of any stopword, and a title left with at
 * most one n-gram is removed from the list.
 */
export function legacyPruneQuirks(perTitle: string[][], stops: Stopwords): string[][] {
  return perTitle
    .map((grams) =>
      grams.filter((g) => {
        const toks = g.split("_");
        return !stops.isSubstringOfAny(rLower(toks[0])) && !stops.isSubstringOfAny(rLower(toks[toks.length - 1]));
      }),
    )
    .filter((grams) => grams.length > 1);
}

/**
 * De-duplicate overlapping n-grams, preferring the more specific phrase
 * (filter_out_nested_ngrams). Returns up to topN unique names.
 */
export function filterOutNestedNgrams(topNgrams: string[], topN: number): string[] {
  let top: string[] = [];
  for (const ngram of topNgrams) {
    if (ngram === "") continue;
    const inTop = top.map((t) => t.includes(ngram));
    const topIn = top.map((t) => ngram.includes(t));
    const anyInTop = inTop.some(Boolean);
    const anyTopIn = topIn.some(Boolean);
    if (anyInTop && !anyTopIn) {
      // ngram is part of a kept name: skip
    } else if (!anyInTop && anyTopIn) {
      top = top.map((t, i) => (topIn[i] ? ngram : t));
    } else if (!anyInTop && !anyTopIn) {
      top.push(ngram);
    }
  }
  return [...new Set(top)].slice(0, topN);
}
