/**
 * Text hygiene and punctuation-aware segmentation. Port of text_hygiene.R.
 */

// PCRE (non-UCP) \s and \S: ASCII whitespace only.
const S = "[^\\t\\n\\v\\f\\r ]";
const SP = "[\\t\\n\\v\\f\\r ]";

/** Decode numeric and common named HTML entities; normalise no-break spaces and dashes. */
export function decodeHtmlEntities(x: string): string {
	let s = x;
	if (s.includes("&")) {
		s = s.replace(/&#([0-9]{1,7});/g, (m, d: string) => {
			const cp = parseInt(d, 10);
			return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
		});
		s = s.replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (m, h: string) => {
			const cp = parseInt(h, 16);
			return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
		});
		s = s
			.split("&nbsp;")
			.join(" ")
			.split("&lt;")
			.join("<")
			.split("&gt;")
			.join(">")
			.split("&quot;")
			.join('"')
			.split("&apos;")
			.join("'")
			.split("&amp;")
			.join("&");
	}
	s = s.replace(/[\u00a0\u202f]/g, " ");
	return s.replace(/[\u2013\u2010]/g, "-");
}

/** Strip URLs, signed-URL residue, HTML tags and over-long no-space tokens. */
export function sanitizeCorpusNoise(x: string): string {
	let s = x;
	s = s.replace(new RegExp(`(https?://|www\\.)${S}+`, "gu"), " ");
	s = s.replace(new RegExp(`${S}*&key-pair-id=${S}*`, "gu"), " ");
	s = s.replace(/<\/?[A-Za-z][^>]*>/gu, " ");
	s = s.replace(new RegExp(`<${SP}*/${SP}*[A-Za-z]*>?`, "gu"), " ");
	s = s.replace(new RegExp(`${S}{80,}`, "gu"), " ");
	return s;
}

/** Normalise a combined token string into the ";"-separated corpus form. */
export function normalizeCorpusTokens(s: string): string {
	let x = s.replace(/\?+_\?+|\?+|\?+ /g, "");
	x = x.replace(/;+/g, ";");
	x = x.replace(/ ?; ?/g, ";");
	x = x.replace(/ +/g, ";");
	return x;
}

/** Remove a leading or trailing MeSH major-topic "*" from each keyword. */
export function stripMajorTopicMarkers(x: string): string {
	return x.replace(/(^|;\s*)\*+/g, "$1").replace(/\*+(\s*;|$)/g, "$1");
}

const COLON_KEEP_TOKENS = ["80:20", "50:50"];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COLON_KEEP = COLON_KEEP_TOKENS.map((tok) => ({
	re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(tok)}(?![\\p{L}\\p{N}])`, "gu"),
	placeholder: tok.split(":").join("\x03"),
}));

/**
 * Split a text into punctuation-delimited segments for n-gram formation.
 * See punctuation_segments() in text_hygiene.R for the rules.
 */
export function punctuationSegments(input: string | null | undefined): string[] {
	let text = input ?? "";
	text = sanitizeCorpusNoise(decodeHtmlEntities(text));
	text = text.replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, " ");
	text = text.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, "");
	text = text.replace(/\u2011/g, "-");
	text = text.replace(/[\u2019\u2018\u02bc]/g, "'");
	text = text.replace(/\uff1a/g, ":");
	text = text.replace(new RegExp(`(?<=[^\\t\\n\\v\\f\\r -])--(?=[^\\t\\n\\v\\f\\r -])`, "gu"), "-");
	text = text.replace(/(?<![\p{L}\p{N}])(?:\p{L}\.){2,}/gu, (m) => m.split(".").join("\x01"));
	for (const { re, placeholder } of COLON_KEEP) text = text.replace(re, placeholder);
	text = text.replace(/(?<=[\p{L}\p{N}])\(([\p{L}\p{N}]+)\)/gu, "\x04$1\x05");
	text = text.replace(/\(([\p{L}\p{N}]+)\)(?=[\p{L}\p{N}])/gu, "\x04$1\x05");
	text = text.replace(new RegExp(`(^|${SP})\\x04`, "gu"), "$1\x02\x04");
	text = text.replace(new RegExp(`\\x05(?=${SP}|$)`, "gu"), "\x05\x02");
	const punct = "[^\\p{L}\\p{N}\\t\\n\\v\\f\\r \\x01\\x02\\x03\\x04\\x05]";
	text = text.replace(new RegExp(`${punct}{2,}`, "gu"), "\x02");
	text = text.replace(/[\u2014|:_]/g, "\x02");
	text = text.replace(new RegExp(`(^|[\\t\\n\\v\\f\\r \\x02])${punct}`, "gu"), "$1\x02");
	text = text.replace(new RegExp(`${punct}([\\t\\n\\v\\f\\r \\x02]|$)`, "gu"), "\x02$1");
	text = text.replace(/\x01/g, ".").replace(/\x03/g, ":").replace(/\x04/g, "(").replace(/\x05/g, ")");
	return text
		.split("\x02")
		.map((seg) => seg.replace(/\s+/gu, " ").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ""))
		.filter((seg) => seg.length > 0);
}
