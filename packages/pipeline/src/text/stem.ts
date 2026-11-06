/**
 * English Snowball ("Porter2") stemmer, written to match the libstemmer build
 * used by R's SnowballC (`SnowballC::wordStem(x, "english")`), which is what
 * `tm::stemDocument` calls in the R pipeline.
 *
 * Works on Unicode code points. Only a-z/y count as vowels, so digits and
 * non-ASCII letters are consonants, exactly as in libstemmer. Input is expected
 * to be lowercase already (the pipeline lowercases before stemming); uppercase
 * letters are treated as consonants, as libstemmer does.
 */

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);
const VALID_LI = new Set(["c", "d", "e", "g", "h", "k", "m", "n", "r", "t"]);

const EXCEPTION1: Record<string, string> = {
	skis: "ski",
	skies: "sky",
	dying: "die",
	lying: "lie",
	tying: "tie",
	idly: "idl",
	gently: "gentl",
	ugly: "ugli",
	early: "earli",
	only: "onli",
	singly: "singl",
	sky: "sky",
	news: "news",
	howe: "howe",
	atlas: "atlas",
	cosmos: "cosmos",
	bias: "bias",
	andes: "andes",
};

const EXCEPTION2 = new Set(["inning", "outing", "canning", "herring", "earring", "proceed", "exceed", "succeed"]);

const REGION_PREFIXES = ["gener", "commun", "arsen"];

const isV = (c: string | undefined) => c !== undefined && VOWELS.has(c);

function endsWith(w: string[], suffix: string): boolean {
	const s = Array.from(suffix);
	if (s.length > w.length) return false;
	for (let i = 0; i < s.length; i++) if (w[w.length - s.length + i] !== s[i]) return false;
	return true;
}

/** Longest suffix of `w` among `list`, or undefined. */
function longest(w: string[], list: readonly string[]): string | undefined {
	let best: string | undefined;
	let bestLen = -1;
	for (const s of list) {
		const n = Array.from(s).length;
		if (n > bestLen && endsWith(w, s)) {
			best = s;
			bestLen = n;
		}
	}
	return best;
}

function replaceSuffix(w: string[], suffixLen: number, repl: string): string[] {
	return w.slice(0, w.length - suffixLen).concat(Array.from(repl));
}

/** shortv, tested on the letters ending at position `end` (exclusive). */
function shortv(w: string[], end: number): boolean {
	const a = w[end - 1];
	const b = w[end - 2];
	const c = w[end - 3];
	if (end >= 3 && !isV(a) && a !== "w" && a !== "x" && a !== "Y" && isV(b) && !isV(c)) return true;
	if (end === 2 && !isV(a) && isV(b)) return true;
	return false;
}

function markRegions(w: string[]): [number, number] {
	const n = w.length;
	let p1 = n;
	let p2 = n;
	let i = -1;
	for (const pre of REGION_PREFIXES) {
		const p = Array.from(pre);
		if (p.length <= n && p.every((ch, k) => w[k] === ch)) {
			i = p.length;
			break;
		}
	}
	const gopastVNonV = (from: number): number => {
		let k = from;
		while (k < n && !isV(w[k])) k++;
		if (k >= n) return -1;
		k++;
		while (k < n && isV(w[k])) k++;
		if (k >= n) return -1;
		return k + 1;
	};
	if (i < 0) i = gopastVNonV(0);
	if (i < 0) return [p1, p2];
	p1 = i;
	const j = gopastVNonV(p1);
	if (j >= 0) p2 = j;
	return [p1, p2];
}

export function stem(word: string): string {
	if (Object.prototype.hasOwnProperty.call(EXCEPTION1, word)) return EXCEPTION1[word];
	let w = Array.from(word);
	if (w.length < 3) return word;

	// prelude
	let yFound = false;
	if (w[0] === "'") w = w.slice(1);
	if (w[0] === "y") {
		w[0] = "Y";
		yFound = true;
	}
	for (let k = 1; k < w.length; k++) {
		if (w[k] === "y" && isV(w[k - 1])) {
			w[k] = "Y";
			yFound = true;
		}
	}

	const [p1, p2] = markRegions(w);
	const R1 = (pos: number) => p1 <= pos;
	const R2 = (pos: number) => p2 <= pos;

	// Step 1a
	{
		const ap = longest(w, ["'", "'s", "'s'"]);
		if (ap) w = w.slice(0, w.length - Array.from(ap).length);
		const s = longest(w, ["sses", "ied", "ies", "s", "us", "ss"]);
		if (s === "sses") w = replaceSuffix(w, 4, "ss");
		else if (s === "ied" || s === "ies") w = replaceSuffix(w, 3, w.length - 3 >= 2 ? "i" : "ie");
		else if (s === "s") {
			// next gopast v: a vowel somewhere before the letter preceding the "s"
			let found = false;
			for (let k = w.length - 3; k >= 0; k--)
				if (isV(w[k])) {
					found = true;
					break;
				}
			if (found) w = w.slice(0, -1);
		}
	}

	if (!EXCEPTION2.has(w.join(""))) {
		// Step 1b
		{
			const s = longest(w, ["eed", "eedly", "ed", "edly", "ing", "ingly"]);
			if (s === "eed" || s === "eedly") {
				const bra = w.length - Array.from(s).length;
				if (R1(bra)) w = replaceSuffix(w, s.length, "ee");
			} else if (s) {
				const bra = w.length - s.length;
				let hasV = false;
				for (let k = bra - 1; k >= 0; k--)
					if (isV(w[k])) {
						hasV = true;
						break;
					}
				if (hasV) {
					w = w.slice(0, bra);
					const t = longest(w, ["at", "bl", "iz", "bb", "dd", "ff", "gg", "mm", "nn", "pp", "rr", "tt"]);
					if (t === "at" || t === "bl" || t === "iz") w = w.concat(["e"]);
					else if (t) w = w.slice(0, -1);
					else if (w.length === p1 && shortv(w, w.length)) w = w.concat(["e"]);
				}
			}
		}
		// Step 1c
		{
			const last = w[w.length - 1];
			if ((last === "y" || last === "Y") && w.length >= 3 && !isV(w[w.length - 2])) {
				w[w.length - 1] = "i";
			}
		}
		// Step 2
		{
			const list = [
				"tional",
				"enci",
				"anci",
				"abli",
				"entli",
				"izer",
				"ization",
				"ational",
				"ation",
				"ator",
				"alism",
				"aliti",
				"alli",
				"fulness",
				"ousli",
				"ousness",
				"iveness",
				"iviti",
				"biliti",
				"bli",
				"ogi",
				"fulli",
				"lessli",
				"li",
			];
			const s = longest(w, list);
			if (s && R1(w.length - s.length)) {
				const n = s.length;
				const map: Record<string, string> = {
					tional: "tion",
					enci: "ence",
					anci: "ance",
					abli: "able",
					entli: "ent",
					izer: "ize",
					ization: "ize",
					ational: "ate",
					ation: "ate",
					ator: "ate",
					alism: "al",
					aliti: "al",
					alli: "al",
					fulness: "ful",
					ousli: "ous",
					ousness: "ous",
					iveness: "ive",
					iviti: "ive",
					biliti: "ble",
					bli: "ble",
					fulli: "ful",
					lessli: "less",
				};
				if (s === "ogi") {
					if (w[w.length - n - 1] === "l") w = replaceSuffix(w, n, "og");
				} else if (s === "li") {
					if (VALID_LI.has(w[w.length - n - 1])) w = w.slice(0, -n);
				} else w = replaceSuffix(w, n, map[s]);
			}
		}
		// Step 3
		{
			const s = longest(w, ["tional", "ational", "alize", "icate", "iciti", "ical", "ful", "ness", "ative"]);
			if (s && R1(w.length - s.length)) {
				const n = s.length;
				if (s === "tional") w = replaceSuffix(w, n, "tion");
				else if (s === "ational") w = replaceSuffix(w, n, "ate");
				else if (s === "alize") w = replaceSuffix(w, n, "al");
				else if (s === "icate" || s === "iciti" || s === "ical") w = replaceSuffix(w, n, "ic");
				else if (s === "ful" || s === "ness") w = w.slice(0, -n);
				else if (s === "ative" && R2(w.length - n)) w = w.slice(0, -n);
			}
		}
		// Step 4
		{
			const s = longest(w, [
				"al",
				"ance",
				"ence",
				"er",
				"ic",
				"able",
				"ible",
				"ant",
				"ement",
				"ment",
				"ent",
				"ism",
				"ate",
				"iti",
				"ous",
				"ive",
				"ize",
				"ion",
			]);
			if (s && R2(w.length - s.length)) {
				const n = s.length;
				if (s === "ion") {
					const prev = w[w.length - n - 1];
					if (prev === "s" || prev === "t") w = w.slice(0, -n);
				} else w = w.slice(0, -n);
			}
		}
		// Step 5
		{
			const last = w[w.length - 1];
			const bra = w.length - 1;
			if (last === "e") {
				if (R2(bra) || (R1(bra) && !shortv(w, bra))) w = w.slice(0, -1);
			} else if (last === "l") {
				if (R2(bra) && w[bra - 1] === "l") w = w.slice(0, -1);
			}
		}
	}

	// postlude
	if (yFound) w = w.map((c) => (c === "Y" ? "y" : c));
	return w.join("");
}
