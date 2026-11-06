/**
 * Small helpers that reproduce R string semantics the pipeline depends on.
 */

/**
 * String comparison used by R under en_US.UTF-8 (strcoll). ICU's en-US
 * collation matches glibc's on the vocabularies tested; strings that differ
 * only in ignorable characters (such as a soft hyphen) compare equal.
 */
const collator = new Intl.Collator("en-US");
export const collate = (a: string, b: string): number => (a === b ? 0 : collator.compare(a, b));

const SHELL_INCS = [
	1073790977, 268460033, 67121153, 16783361, 4197377, 1050113, 262913, 65921, 16577, 4193, 1073, 281, 77, 23, 8, 1,
];

/**
 * R's sort() for character vectors: a Shell sort (sort.c, ssort2) with
 * collation order. It is not stable, so strings that collate equal end up in
 * the order this exact algorithm leaves them, which this reproduces.
 */
export function rSort(values: string[], decreasing = false): string[] {
	const x = values.slice();
	const n = x.length;
	let t = 0;
	while (t < SHELL_INCS.length && SHELL_INCS[t] > n) t++;
	for (; t < SHELL_INCS.length; t++) {
		const h = SHELL_INCS[t];
		for (let i = h; i < n; i++) {
			const v = x[i];
			let j = i;
			if (decreasing) {
				while (j >= h && collate(x[j - h], v) < 0) {
					x[j] = x[j - h];
					j -= h;
				}
			} else {
				while (j >= h && collate(x[j - h], v) > 0) {
					x[j] = x[j - h];
					j -= h;
				}
			}
			x[j] = v;
		}
	}
	return x;
}

/** sort(unique(x)): unique values in first-appearance order, then R's sort. */
export const sortUnique = (values: Iterable<string>): string[] => rSort([...new Set(values)]);

/**
 * R's tolower(): lowercases code point by code point (glibc towlower), with no
 * context rules. So a final capital sigma becomes "σ" and dotted capital I
 * becomes plain "i", unlike String.prototype.toLowerCase().
 */
export function rLower(s: string): string {
	let out = "";
	for (const ch of s) {
		const l = ch.toLowerCase();
		out += l.length === ch.length ? l : Array.from(l)[0];
	}
	return out;
}

/** R's toupper() on the first character only, as used by paste0(toupper(substr(x, 1, 1)), substr(x, 2, nchar(x))). */
export function capitalizeFirst(s: string): string {
	const chars = Array.from(s);
	if (!chars.length) return s;
	const u = chars[0].toUpperCase();
	chars[0] = Array.from(u).length === 1 ? u : chars[0];
	return chars.join("");
}

/** nchar(x, type = "chars"). */
export const nchar = (s: string): number => Array.from(s).length;

/** trimws(): strips [ \t\r\n] at both ends. */
export const trimws = (s: string): string => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");

/** gsub("^\\s+|\\s+$", "", x) with TRE's Unicode-aware \s. */
export const trim = (s: string): string => s.replace(/^\s+|\s+$/gu, "");

/**
 * R's paste(a, b, sep = " ", collapse = " ") for two character vectors:
 * the shorter vector is recycled, a zero-length vector is treated as "".
 */
export function pasteRecycled(a: string[], b: string[], collapse: string): string {
	const n = Math.max(a.length, b.length);
	if (n === 0) return "";
	const aa = a.length ? a : [""];
	const bb = b.length ? b : [""];
	const parts: string[] = [];
	for (let i = 0; i < n; i++) parts.push(`${aa[i % aa.length]} ${bb[i % bb.length]}`);
	return parts.join(collapse);
}

/**
 * Stable order of `keys` by decreasing `count`, ties kept in the given order.
 * Mirrors sort(x, decreasing = TRUE) on a named vector (radix sort is stable).
 */
export function sortDecreasing<T>(items: T[], value: (t: T) => number): T[] {
	return items
		.map((item, i) => ({ item, i, v: value(item) }))
		.sort((x, y) => y.v - x.v || x.i - y.i)
		.map((x) => x.item);
}

/** table(x) as [value, count] pairs in factor-level order (sort(unique(x))). */
export function table(values: string[]): Array<[string, number]> {
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return sortUnique(values).map((v) => [v, counts.get(v)!]);
}

/** strsplit(x, sep, fixed = TRUE)[[1]]: "" gives no pieces and one trailing empty piece is dropped. */
export function rStrsplit(x: string, sep: string): string[] {
	if (x === "") return [];
	const parts = x.split(sep);
	if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
	return parts;
}
