/**
 * Agglomerative clustering with the Lance-Williams update, following R's
 * hclust() Fortran routine (F. Murtagh's nearest-neighbour list algorithm),
 * including its tie-breaking, so merge order matches R.
 */

export type LinkageMethod = "ward.D";

export interface Hclust {
	n: number;
	/** Merge steps as pairs of original observation indices (cluster representatives, i < j). */
	ia: Int32Array;
	ib: Int32Array;
	/** Merge heights. */
	height: Float64Array;
}

/** `dist` is a flat n*n symmetric matrix. */
export function hclust(dist: Float64Array, n: number, method: LinkageMethod = "ward.D"): Hclust {
	if (method !== "ward.D") throw new Error(`unsupported method ${method}`);
	const D = Float64Array.from(dist);
	const at = (i: number, j: number) => D[i * n + j];
	const set = (i: number, j: number, v: number) => {
		D[i * n + j] = v;
		D[j * n + i] = v;
	};
	const flag = new Uint8Array(n).fill(1);
	const membr = new Float64Array(n).fill(1);
	const nn = new Int32Array(n);
	const disnn = new Float64Array(n);
	const ia = new Int32Array(Math.max(n - 1, 0));
	const ib = new Int32Array(Math.max(n - 1, 0));
	const height = new Float64Array(Math.max(n - 1, 0));
	const INF = Number.MAX_VALUE;

	for (let i = 0; i < n - 1; i++) {
		let dmin = INF;
		let jm = 0;
		for (let j = i + 1; j < n; j++) {
			if (dmin > at(i, j)) {
				dmin = at(i, j);
				jm = j;
			}
		}
		nn[i] = jm;
		disnn[i] = dmin;
	}

	for (let step = 0; step < n - 1; step++) {
		let dmin = INF;
		let im = 0;
		let jm = 0;
		for (let i = 0; i < n - 1; i++) {
			if (flag[i] && disnn[i] < dmin) {
				dmin = disnn[i];
				im = i;
				jm = nn[i];
			}
		}
		const i2 = Math.min(im, jm);
		const j2 = Math.max(im, jm);
		ia[step] = i2;
		ib[step] = j2;
		height[step] = dmin;
		flag[j2] = 0;

		dmin = INF;
		let jj = 0;
		const xx = at(i2, j2);
		for (let k = 0; k < n; k++) {
			if (!flag[k] || k === i2) continue;
			const d =
				((membr[i2] + membr[k]) * at(i2, k) + (membr[j2] + membr[k]) * at(j2, k) - membr[k] * xx) /
				(membr[i2] + membr[j2] + membr[k]);
			set(i2, k, d);
			if (i2 < k) {
				if (d < dmin) {
					dmin = d;
					jj = k;
				}
			} else if (d < disnn[k]) {
				disnn[k] = d;
				nn[k] = i2;
			}
		}
		membr[i2] += membr[j2];
		disnn[i2] = dmin;
		nn[i2] = jj;

		for (let i = 0; i < n - 1; i++) {
			if (flag[i] && (nn[i] === i2 || nn[i] === j2)) {
				let dm = INF;
				let jn = jj;
				for (let j = i + 1; j < n; j++) {
					if (flag[j] && at(i, j) < dm) {
						dm = at(i, j);
						jn = j;
					}
				}
				nn[i] = jn;
				disnn[i] = dm;
			}
		}
	}
	return { n, ia, ib, height };
}

/**
 * cutree(hclust, k): cluster ids 1..k, numbered in order of first appearance
 * of an observation, after applying the first n - k merges.
 */
export function cutree(h: Hclust, k: number): number[] {
	const parent = Int32Array.from({ length: h.n }, (_, i) => i);
	const find = (x: number): number => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x]];
			x = parent[x];
		}
		return x;
	};
	for (let s = 0; s < h.n - k; s++) {
		const a = find(h.ia[s]);
		const b = find(h.ib[s]);
		if (a !== b) parent[b] = a;
	}
	const ids = new Map<number, number>();
	return Array.from({ length: h.n }, (_, i) => {
		const r = find(i);
		if (!ids.has(r)) ids.set(r, ids.size + 1);
		return ids.get(r)!;
	});
}

/**
 * R's merge matrix (negative = singleton observation, positive = earlier step),
 * for comparison with hclust()$merge.
 */
export function mergeMatrix(h: Hclust): Array<[number, number]> {
	const lastStep = new Int32Array(h.n).fill(0);
	const out: Array<[number, number]> = [];
	for (let s = 0; s < h.n - 1; s++) {
		const a = h.ia[s];
		const b = h.ib[s];
		const ra = lastStep[a] ? lastStep[a] : -(a + 1);
		const rb = lastStep[b] ? lastStep[b] : -(b + 1);
		// hcass2: two singletons keep (-i, -j) with i < j; a singleton goes first;
		// two clusters are ordered by step
		let pair: [number, number];
		if (ra < 0 && rb < 0) pair = [ra, rb];
		else if (ra < 0) pair = [ra, rb];
		else if (rb < 0) pair = [rb, ra];
		else pair = ra < rb ? [ra, rb] : [rb, ra];
		out.push(pair);
		lastStep[a] = s + 1;
		lastStep[b] = s + 1;
	}
	return out;
}
