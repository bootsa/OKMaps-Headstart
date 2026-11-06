/**
 * Choosing the number of areas and assigning papers to them. Port of
 * create_clusters() (cluster.R) with the GMD functions it uses
 * (css.hclust, elbow.batch).
 */
import { cutree, hclust, type Hclust } from "./hclust.js";

function sumSquaresWithin(D: Float64Array, n: number, idx: number[]): number {
  const m = idx.length;
  if (m < 2) return 0;
  let s = 0;
  for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
    const d = D[idx[a] * n + idx[b]];
    s += d * d;
  }
  const pairs = (m * (m - 1)) / 2;
  return (s / pairs / 2) * (m - 1);
}

/** Explained variance for k = 1..kmax clusters (GMD css.hclust). */
export function explainedVariance(D: Float64Array, n: number, h: Hclust, kmax = Math.min(n, 20)): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  const tss = sumSquaresWithin(D, n, all);
  const ev: number[] = [];
  for (let k = 1; k <= kmax; k++) {
    const groups = cutree(h, k);
    const members = new Map<number, number[]>();
    groups.forEach((g, i) => {
      if (!members.has(g)) members.set(g, []);
      members.get(g)!.push(i);
    });
    let wss = 0;
    for (const idx of members.values()) wss += sumSquaresWithin(D, n, idx);
    ev.push((tss - wss) / tss);
  }
  return ev;
}

/** GMD elbow(): smallest k meeting the EV threshold and the EV-increment threshold, or NaN. */
function elbow(ev: number[], incThres: number, evThres: number, precision = 3): number {
  const eps = -(0.1 ** precision);
  const n = ev.length;
  const inc = ev.map((v, i) => (i < n - 1 ? ev[i + 1] - v : 0));
  let k1 = NaN;
  for (let i = 0; i < n; i++) if (ev[i] - evThres >= eps) { k1 = i + 1; break; }
  let k2 = NaN;
  for (let i = 0; i < n - 1; i++) if (incThres - inc[i] >= eps) { k2 = i + 1; break; }
  return Number.isNaN(k1) || Number.isNaN(k2) ? NaN : Math.max(k1, k2);
}

/** GMD elbow.batch(): first k found over decreasing EV and increasing increment thresholds. */
export function elbowBatch(ev: number[]): number | undefined {
  for (const e of [0.95, 0.9, 0.8, 0.75, 0.67, 0.5, 0.33]) {
    for (const i of [0.01, 0.05, 0.1]) {
      const k = elbow(ev, i, e);
      if (!Number.isNaN(k)) return k;
    }
  }
  return undefined;
}

export interface Clusters {
  /** Cluster id (1-based) per document, in input order. */
  groups: number[];
  numClusters: number;
  ev: number[];
  hclust: Hclust;
}

/**
 * Number of areas: the elbow rule, capped at maxClusters (raised for large
 * maps), sqrt(n) + 1 for maps of 30 papers or fewer.
 */
export function createClusters(D: Float64Array, n: number, maxClusters = 15): Clusters {
  if (n < 2) {
    const h: Hclust = { n, ia: new Int32Array(0), ib: new Int32Array(0), height: new Float64Array(0) };
    return { groups: Array(n).fill(1), numClusters: 1, ev: [], hclust: h };
  }
  const h = hclust(D, n, "ward.D");
  const ev = explainedVariance(D, n, h);
  // When elbow.batch finds no k, the R fallback loop ends with max_clusters.
  let k = elbowBatch(ev) ?? maxClusters;
  if (maxClusters > -1 && k > maxClusters) {
    k = maxClusters;
    if (n >= 500) k = 20;
    else if (n >= 400) k = 19;
    else if (n >= 300) k = 18;
    else if (n >= 200) k = 17;
    else if (n >= 150) k = 16;
  }
  if (n <= 30) k = Math.round(Math.sqrt(n)) + 1;
  k = Math.min(k, n);
  let groups = cutree(h, k);
  if (n >= 30 && new Set(groups).size === 1) {
    k = maxClusters;
    groups = cutree(h, k);
  }
  return { groups, numClusters: k, ev, hclust: h };
}
