/**
 * Keywords for papers without any: port of replace_keywords_if_empty()
 * (preprocess.R).
 */
import { filterOutNestedNgrams, ngramCandidates } from "../text/ngrams.js";
import { nchar, rLower, sortDecreasing } from "../text/rstring.js";
import type { Stopwords } from "../text/stopwords.js";

const codePointCompare = (a: string, b: string): number => {
  const ca = Array.from(a);
  const cb = Array.from(b);
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    const d = ca[i].codePointAt(0)! - cb[i].codePointAt(0)!;
    if (d) return d;
  }
  return ca.length - cb.length;
};

const utf8 = new TextEncoder();

/**
 * tm's TermDocumentMatrix for a SimpleCorpus: whitespace tokens, lowercased,
 * terms of 3+ bytes (tm's C++ code counts UTF-8 bytes, so "та" is kept). Terms are numbered by first appearance, each
 * document contributing its new terms in byte order.
 */
function simpleCorpusTdm(docs: string[]): { terms: string[]; counts: Array<Map<string, number>> } {
  const terms: string[] = [];
  const seen = new Set<string>();
  const counts = docs.map((d) => {
    const m = new Map<string, number>();
    for (const tok of rLower(d).split(/[ \t\n\r\f\v]+/)) {
      if (!tok || utf8.encode(tok).length < 3) continue;
      m.set(tok, (m.get(tok) ?? 0) + 1);
    }
    const sorted = new Map([...m.entries()].sort((a, b) => codePointCompare(a[0], b[0])));
    for (const t of sorted.keys()) if (!seen.has(t)) { seen.add(t); terms.push(t); }
    return sorted;
  });
  return { terms, counts };
}

export interface KeywordResult {
  subject: Array<string | null>;
  subjectIsHeuristic: boolean[];
}

/**
 * Papers whose subject has at most one character get three keywords made from
 * their title's unigrams and bigrams (most frequent in the title, ties in
 * vocabulary order). A null subject counts as present, as NA does in R.
 */
export function replaceKeywordsIfEmpty(
  titles: Array<string | null>,
  subjects: Array<string | null>,
  stops: Stopwords,
): KeywordResult {
  const subject = subjects.map((s) => (s == null ? null : s.replace(/ +/g, " ")));
  const flagged = subject.map((s) => s !== null && nchar(s) <= 1);
  if (!flagged.some(Boolean)) return { subject, subjectIsHeuristic: flagged };

  const candidates = titles.map((t) => ngramCandidates(t, stops, [2], true).join(" "));
  const { terms, counts } = simpleCorpusTdm(candidates);
  subject.forEach((_, i) => {
    if (!flagged[i]) return;
    const column = terms.map((t) => [t, counts[i].get(t) ?? 0] as [string, number]);
    const sorted = sortDecreasing(column, (x) => x[1]);
    const third = sorted.length >= 3 ? sorted[2][1] : -Infinity;
    const top = sorted.filter((x) => x[1] >= third).map((x) => x[0]);
    const kws = filterOutNestedNgrams(top, 3);
    // the R second pass (title + abstract) cannot run (it errors), so an empty result stays empty
    subject[i] = kws.join("; ").replace(/_/g, " ");
  });
  return { subject, subjectIsHeuristic: flagged };
}
