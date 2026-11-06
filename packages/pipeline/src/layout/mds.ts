/**
 * Two-dimensional layout of the papers from their distances.
 *
 * The R pipeline uses vegan::metaMDS (monoMDS, linear model) with random
 * restarts, so its layout changes from run to run. This port is
 * deterministic: it starts from classical (Torgerson) scaling, minimises the
 * same linear-regression stress with SMACOF iterations, then applies vegan's
 * postMDS steps (centre, rotate to principal axes, scale).
 */

export interface LayoutOptions {
  maxIterations?: number;
  /** Stop when the relative stress improvement falls below this. */
  tolerance?: number;
  /** postMDS half-change threshold (fraction of the ceiling distance, R uses 0.19). */
  halfchangeThreshold?: number;
  /** Minimum number of pairs below the threshold for half-change scaling (R uses 10). */
  halfchangeMinPairs?: number;
}

export interface Layout {
  x: number[];
  y: number[];
  stress: number;
}

/** Top-2 eigenpairs of a symmetric matrix by orthogonal (subspace) iteration. */
function top2Eigen(B: Float64Array, n: number): { vectors: [Float64Array, Float64Array]; values: [number, number] } {
  let v1 = Float64Array.from({ length: n }, (_, i) => 1 + (i % 7) / 7);
  let v2 = Float64Array.from({ length: n }, (_, i) => ((i * 37) % 11) / 11 - 0.5);
  const mul = (v: Float64Array) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const row = i * n;
      for (let j = 0; j < n; j++) s += B[row + j] * v[j];
      out[i] = s;
    }
    return out;
  };
  const dot = (a: Float64Array, b: Float64Array) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  };
  const normalize = (a: Float64Array) => {
    const l = Math.sqrt(dot(a, a)) || 1;
    for (let i = 0; i < n; i++) a[i] /= l;
    return a;
  };
  normalize(v1);
  const p0 = dot(v2, v1);
  for (let i = 0; i < n; i++) v2[i] -= p0 * v1[i];
  normalize(v2);
  let l1 = 0;
  let l2 = 0;
  for (let it = 0; it < 1000; it++) {
    const w1 = mul(v1);
    const w2 = mul(v2);
    // Gram-Schmidt on the images keeps the pair orthonormal
    normalize(w1);
    const p = dot(w2, w1);
    for (let i = 0; i < n; i++) w2[i] -= p * w1[i];
    normalize(w2);
    const delta = Math.abs(1 - Math.abs(dot(w1, v1))) + Math.abs(1 - Math.abs(dot(w2, v2)));
    v1 = w1;
    v2 = w2;
    if (delta < 1e-14) break;
  }
  l1 = dot(v1, mul(v1));
  l2 = dot(v2, mul(v2));
  if (l2 > l1) return { vectors: [v2, v1], values: [l2, l1] };
  return { vectors: [v1, v2], values: [l1, l2] };
}

/** Classical multidimensional scaling (R's cmdscale(d, k = 2)). */
export function classicalMds(D: Float64Array, n: number): Float64Array {
  const B = new Float64Array(n * n);
  const rowMean = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = D[i * n + j] * D[i * n + j];
      B[i * n + j] = v;
      rowMean[i] += v;
    }
    total += rowMean[i];
    rowMean[i] /= n;
  }
  total /= n * n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    B[i * n + j] = -0.5 * (B[i * n + j] - rowMean[i] - rowMean[j] + total);
  }
  const { vectors, values } = top2Eigen(B, n);
  const X = new Float64Array(n * 2);
  for (let d = 0; d < 2; d++) {
    const s = Math.sqrt(Math.max(values[d], 0));
    for (let i = 0; i < n; i++) X[i * 2 + d] = vectors[d][i] * s;
  }
  return X;
}

function pairDistances(X: Float64Array, n: number): Float64Array {
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const v = Math.hypot(X[i * 2] - X[j * 2], X[i * 2 + 1] - X[j * 2 + 1]);
    d[i * n + j] = v;
    d[j * n + i] = v;
  }
  return d;
}

/**
 * Linear (interval) regression of configuration distances on dissimilarities:
 * the disparities monoMDS fits with model = "linear".
 */
function linearDisparities(delta: Float64Array, d: Float64Array, n: number): Float64Array {
  let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const x = delta[i * n + j];
    const y = d[i * n + j];
    sx += x; sy += y; sxx += x * x; sxy += x * y; m++;
  }
  const varx = sxx - (sx * sx) / m;
  let b = varx > 0 ? (sxy - (sx * sy) / m) / varx : 0;
  if (b < 0) b = 0;
  const a = (sy - b * sx) / m;
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const v = Math.max(a + b * delta[i * n + j], 0);
    out[i * n + j] = v;
    out[j * n + i] = v;
  }
  return out;
}

function stress1(d: Float64Array, dhat: Float64Array, n: number): number {
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const e = d[i * n + j] - dhat[i * n + j];
    num += e * e;
    den += d[i * n + j] * d[i * n + j];
  }
  return den > 0 ? Math.sqrt(num / den) : 0;
}

/** vegan::postMDS: centre, principal-axes rotation, then half-change or max-distance scaling. */
function postMds(X: Float64Array, delta: Float64Array, n: number, threshold: number, minPairs: number): Float64Array {
  const out = Float64Array.from(X);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += out[i * 2]; my += out[i * 2 + 1]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    out[i * 2] -= mx; out[i * 2 + 1] -= my;
    sxx += out[i * 2] ** 2; syy += out[i * 2 + 1] ** 2; sxy += out[i * 2] * out[i * 2 + 1];
  }
  // eigenvectors of the 2x2 scatter matrix
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c = Math.cos(theta), s = Math.sin(theta);
  for (let i = 0; i < n; i++) {
    const x = out[i * 2], y = out[i * 2 + 1];
    out[i * 2] = c * x + s * y;
    out[i * 2 + 1] = -s * x + c * y;
  }
  // deterministic signs: the point furthest along each axis lies on its positive side
  for (let d = 0; d < 2; d++) {
    let best = 0;
    for (let i = 0; i < n; i++) if (Math.abs(out[i * 2 + d]) > Math.abs(best)) best = out[i * 2 + d];
    if (best < 0) for (let i = 0; i < n; i++) out[i * 2 + d] = -out[i * 2 + d];
  }
  const ordi = pairDistances(out, n);
  // half-change scaling: regress dissimilarity on ordination distance for close pairs
  let sx = 0, sy = 0, sx2 = 0, sxy2 = 0, m = 0, maxOrdi = 0, maxDelta = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dl = delta[i * n + j];
    const o = ordi[i * n + j];
    if (o > maxOrdi) maxOrdi = o;
    if (dl > maxDelta) maxDelta = dl;
    if (dl < threshold) { sx += o; sy += dl; sx2 += o * o; sxy2 += o * dl; m++; }
  }
  let hc = NaN;
  if (m >= minPairs) {
    const k1 = (sxy2 - (sx * sy) / m) / (sx2 - (sx * sx) / m);
    const k0 = (sy - k1 * sx) / m;
    hc = (1 - k0) / 2 / k1;
  }
  if (!Number.isFinite(hc) || hc <= 0) hc = maxDelta > 0 ? maxOrdi / maxDelta : 1;
  for (let i = 0; i < out.length; i++) out[i] /= hc || 1;
  return out;
}

export function layoutMds(D: Float64Array, n: number, opts: LayoutOptions = {}): Layout {
  if (n === 0) return { x: [], y: [], stress: 0 };
  if (n === 1) return { x: [0], y: [0], stress: 0 };
  const maxIt = opts.maxIterations ?? 500;
  const tol = opts.tolerance ?? 1e-7;
  let X = classicalMds(D, n);
  // a degenerate start (all points equal) gets a fixed spread instead
  if (X.every((v) => v === 0)) X = Float64Array.from({ length: n * 2 }, (_, i) => Math.cos(i * 1.7) * 0.01);
  let d = pairDistances(X, n);
  let dhat = linearDisparities(D, d, n);
  let stress = stress1(d, dhat, n);
  for (let it = 0; it < maxIt; it++) {
    // Guttman transform with unit weights
    const Y = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      let bx = 0, by = 0, bsum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dij = d[i * n + j];
        const b = dij > 1e-12 ? dhat[i * n + j] / dij : 0;
        bsum += b;
        bx -= b * X[j * 2];
        by -= b * X[j * 2 + 1];
      }
      Y[i * 2] = (bx + bsum * X[i * 2]) / n;
      Y[i * 2 + 1] = (by + bsum * X[i * 2 + 1]) / n;
    }
    X = Y;
    d = pairDistances(X, n);
    dhat = linearDisparities(D, d, n);
    const s = stress1(d, dhat, n);
    const done = stress - s < tol * Math.max(stress, 1e-12);
    stress = s;
    if (done) break;
  }
  const P = postMds(X, D, n, opts.halfchangeThreshold ?? 0.19, opts.halfchangeMinPairs ?? 10);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) { x.push(P[i * 2]); y.push(P[i * 2 + 1]); }
  return { x, y, stress };
}

/** Stress-1 of a given configuration under the linear model (to compare layouts). */
export function layoutStress(D: Float64Array, n: number, xy: Array<[number, number]>): number {
  const X = new Float64Array(n * 2);
  xy.forEach(([x, y], i) => { X[i * 2] = x; X[i * 2 + 1] = y; });
  const d = pairDistances(X, n);
  return stress1(d, linearDisparities(D, d, n), n);
}

/**
 * Symmetric Procrustes sum of squares between two configurations (vegan's
 * procrustes(symmetric = TRUE)$ss): 0 = identical up to rotation, reflection,
 * scale and translation; 1 = unrelated.
 */
export function procrustesSS(a: Array<[number, number]>, b: Array<[number, number]>): number {
  const n = a.length;
  const centre = (p: Array<[number, number]>) => {
    let mx = 0, my = 0;
    for (const [x, y] of p) { mx += x; my += y; }
    mx /= n; my /= n;
    const c = p.map(([x, y]) => [x - mx, y - my] as [number, number]);
    const norm = Math.sqrt(c.reduce((s, [x, y]) => s + x * x + y * y, 0)) || 1;
    return c.map(([x, y]) => [x / norm, y / norm] as [number, number]);
  };
  const A = centre(a);
  const B = centre(b);
  // singular values of A'B (2x2)
  let m11 = 0, m12 = 0, m21 = 0, m22 = 0;
  for (let i = 0; i < n; i++) {
    m11 += A[i][0] * B[i][0]; m12 += A[i][0] * B[i][1];
    m21 += A[i][1] * B[i][0]; m22 += A[i][1] * B[i][1];
  }
  const t = m11 * m11 + m12 * m12 + m21 * m21 + m22 * m22;
  const det = m11 * m22 - m12 * m21;
  const sumSv = Math.sqrt(Math.max(t + 2 * Math.abs(det), 0));
  return 1 - sumSv * sumSv;
}
