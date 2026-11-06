/**
 * Clustering corpus: port of create_corpus() (features.R) with the tm
 * transformations it applies.
 */
import { decodeHtmlEntities, sanitizeCorpusNoise } from "../text/hygiene.js";
import { rLower } from "../text/rstring.js";
import { stem } from "../text/stem.js";
import type { Stopwords } from "../text/stopwords.js";

/** tm::removePunctuation (default): removes ASCII punctuation only. */
export const removePunctuation = (s: string): string => s.replace(/[!-/:-@[-`{-~]/g, "");

/** tm::stripWhitespace: collapse [[:space:]] runs (glibc iswspace: no-break spaces are not spaces). */
export const stripWhitespace = (s: string): string =>
  s.replace(/[\t\n\v\f\r \u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+/g, " ");

/** NLP words() / scan_tokenizer: split on spaces, tabs and newlines. */
export const scanTokens = (s: string): string[] => s.split(/[ \t\n\r]+/).filter((t) => t.length > 0);

export interface Corpus {
  ids: string[];
  /** Cleaned text before punctuation removal and lowercasing (casing vocabulary). */
  unlowered: string[];
  /** Lowercased, punctuation and stopwords removed. */
  unstemmed: string[];
  /** Same, stemmed word by word. */
  stemmed: string[];
}

export function createCorpus(docs: Array<{ id: string; content: string | null }>, stops: Stopwords): Corpus {
  const ids = docs.map((d) => d.id);
  const unlowered = docs.map((d) => sanitizeCorpusNoise(decodeHtmlEntities(d.content ?? "")));
  const unstemmed = unlowered.map((t) => stripWhitespace(stops.removeWords(rLower(removePunctuation(t)))));
  const stemmed = unstemmed.map((t) => scanTokens(t).map(stem).join(" "));
  return { ids, unlowered, unstemmed, stemmed };
}
