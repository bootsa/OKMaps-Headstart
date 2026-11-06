/**
 * Term-document matrices and cosine distances, following tm's
 * TermDocumentMatrix/termFreq defaults and proxy::dist(method = "cosine").
 */
import { nchar, rLower, sortUnique } from "../text/rstring.js";
import { scanTokens } from "./corpus.js";

export interface TermFreqControl {
  /** Tokenizer; default is tm's words() (whitespace). */
  tokenize?: (doc: string) => string[];
  /** Lowercase tokens (tm default TRUE). */
  tolower?: boolean;
  /** Keep terms whose in-document count lies in [min, max]. */
  localBounds?: [number, number];
  /** Minimum term length in characters (tm default 3). */
  minWordLength?: number;
}

/**
 * termFreq(): per-document term counts after tm's filters. The map's key order
 * is the order of tm's table (sort(unique(tokens))), which decides the order
 * of terms that collate equal in the matrix.
 */
export function termFreq(doc: string, control: TermFreqControl = {}): Map<string, number> {
  const raw = (control.tokenize ?? scanTokens)(doc);
  const lower = control.tolower ?? true;
  const tokens = lower ? raw.map(rLower) : raw;
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const [lo, hi] = control.localBounds ?? [-Infinity, Infinity];
  const minLen = control.minWordLength ?? 3;
  const out = new Map<string, number>();
  for (const t of sortUnique(tokens)) {
    const c = counts.get(t)!;
    if (c >= lo && c <= hi && nchar(t) >= minLen) out.set(t, c);
  }
  return out;
}

/** Sparse term-document matrix: terms in collation order, one count map per document. */
export interface Tdm {
  terms: string[];
  docs: Array<Map<string, number>>;
}

export function termDocumentMatrix(docs: string[], control: TermFreqControl = {}): Tdm {
  const maps = docs.map((d) => termFreq(d, control));
  const all: string[] = [];
  for (const m of maps) all.push(...m.keys());
  return { terms: sortUnique(all), docs: maps };
}

/**
 * Cosine distance matrix (1 - cosine similarity) between documents, as a
 * flat n*n Float64Array. A document without terms has no defined cosine; R
 * returns NaN there and the map fails, here its distance to every other
 * document is 1.
 */
export function cosineDistances(tdm: Tdm): Float64Array {
  const n = tdm.docs.length;
  const norms = tdm.docs.map((m) => {
    let s = 0;
    for (const v of m.values()) s += v * v;
    return Math.sqrt(s);
  });
  const D = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let a = tdm.docs[i];
      let b = tdm.docs[j];
      if (a.size > b.size) [a, b] = [b, a];
      let dot = 0;
      for (const [t, v] of a) {
        const w = b.get(t);
        if (w !== undefined) dot += v * w;
      }
      const denom = norms[i] * norms[j];
      const d = denom > 0 ? 1 - dot / denom : 1;
      D[i * n + j] = d;
      D[j * n + i] = d;
    }
  }
  return D;
}
