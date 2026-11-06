/**
 * R string behaviour the ports depend on.
 *
 * R's default regex engine (TRE) and its perl = TRUE engine (PCRE, without
 * Unicode properties) disagree with JavaScript on a few classes. The
 * constants here spell those classes out so the ported patterns match the
 * same characters:
 *   TRE  \w = iswalnum or "_" (Unicode letters and digits), \s = iswspace,
 *        \d = ASCII digits, "." also matches a newline, and a backslash
 *        inside brackets is a literal backslash.
 *   PCRE \w, \d, \s and \b are ASCII-only.
 */

/** TRE \s: glibc iswspace (no-break spaces are not spaces). */
export const TRE_SPACE = "[\\t\\n\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000]";
/** TRE \w (needs the u flag). */
export const TRE_WORD = "[\\p{L}\\p{N}_]";
/** PCRE \s without UCP. */
export const PCRE_SPACE = "[\\t\\n\\v\\f\\r ]";

/** Whitespace removed by stringi::stri_trim (Unicode White_Space). */
const STRI_SPACE = "[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const STRI_TRIM = new RegExp(`^${STRI_SPACE}+|${STRI_SPACE}+$`, "gu");

/** base::trimws (which = "both", whitespace = "[ \t\r\n]"). */
export const trimws = (s: string) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");

/** stringi::stri_trim. */
export const striTrim = (s: string) => s.replace(STRI_TRIM, "");

/**
 * strsplit(s, sep, fixed = TRUE)[[1]]: "" gives no parts, and one trailing
 * empty part is dropped ("a;" -> ["a"], "a;;" -> ["a", ""]).
 */
export function strsplitFixed(s: string, sep: string): string[] {
	if (s === "") return [];
	const parts = s.split(sep);
	if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
	return parts;
}

/** tolower/toupper per code point, as towlower/towupper do (no ß -> SS). */
function mapCodePoints(s: string, f: (c: string) => string): string {
	let out = "";
	for (const c of s) {
		const m = f(c);
		out += [...m].length === 1 ? m : c;
	}
	return out;
}
export const rLower = (s: string) => mapCodePoints(s, (c) => c.toLowerCase());
export const rUpper = (s: string) => mapCodePoints(s, (c) => c.toUpperCase());
