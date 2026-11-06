/**
 * The rapidfuzz scores the Python workers use (fuzz.ratio, partial_ratio,
 * token_sort_ratio), on code points, with the same results.
 */

/** Python's str.isspace() set (what str.split() and strip() use). */
export const PY_SPACE = "[\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const PY_SPLIT = new RegExp(`${PY_SPACE}+`, "u");
const PY_STRIP = new RegExp(`^${PY_SPACE}+|${PY_SPACE}+$`, "gu");

/** Python str.strip() with no arguments. */
export const pyStrip = (s: string) => s.replace(PY_STRIP, "");
/** Python str.split() with no arguments. */
export const pySplit = (s: string) => pyStrip(s).split(PY_SPLIT).filter((t) => t !== "");

/** Python string ordering (by code point). */
export function pyCompare(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** Length of the longest common subsequence. */
function lcs(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(up, row[j - 1]);
      diag = up;
    }
  }
  return row[b.length];
}

const codes = (s: string) => Array.from(s, (c) => c.codePointAt(0)!);

function ratioCodes(a: number[], b: number[]): number {
  const total = a.length + b.length;
  if (total === 0) return 100;
  return (200 * lcs(a, b)) / total;
}

/** fuzz.ratio: normalized InDel similarity, 0 to 100. */
export const ratio = (a: string, b: string) => ratioCodes(codes(a), codes(b));

/** fuzz.token_sort_ratio: ratio of the whitespace-split, sorted, re-joined strings. */
export function tokenSortRatio(a: string, b: string): number {
  const sortJoin = (s: string) => pySplit(s).sort(pyCompare).join(" ");
  return ratio(sortJoin(a), sortJoin(b));
}

/** Best ratio of the shorter string against windows of the longer one. */
function partialImpl(s1: number[], s2: number[]): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const inS1 = new Set(s1);
  let best = 0;
  const consider = (start: number, end: number) => {
    const r = ratioCodes(s1, s2.slice(start, end));
    if (r > best) best = r;
  };
  if (len2 > len1) for (let j = 0; j < len2 - len1; j++) consider(j, j + len1);
  for (let i = 1; i < len1; i++) if (inS1.has(s2[i - 1])) consider(0, i);
  for (let i = Math.max(0, len2 - len1); i < len2; i++) if (inS1.has(s2[i])) consider(i, len2);
  return best;
}

/** fuzz.partial_ratio. */
export function partialRatio(a: string, b: string): number {
  let s1 = codes(a);
  let s2 = codes(b);
  if (s1.length > s2.length) [s1, s2] = [s2, s1];
  if (s1.length === 0 || s2.length === 0) return s1.length === s2.length ? 100 : 0;
  let score = partialImpl(s1, s2);
  if (score !== 100 && s1.length === s2.length) score = Math.max(score, partialImpl(s2, s1));
  return score;
}
