/**
 * Marks search and query words in a piece of text, as the old Highlight
 * component did with react-highlight-words. The result is a list of plain
 * text parts; components render them as text nodes and <mark>, never as
 * HTML.
 */

import { fold, foldWithPositions } from "./fold";

export type HighlightKind = "search" | "query";

export interface TextPart {
	text: string;
	mark: HighlightKind | null;
}

/** The words of a search query, without fields, operators and quotes (old reducers/query.ts). */
export function queryTerms(query: unknown): string[] {
	if (typeof query !== "string") return [];
	const cleaned = query.replace(/\[(.*?)\]/g, "").replace(/[“”„]/g, '"');
	const phraseRegex = /"(.*?)"/g;
	const phrases = (cleaned.match(phraseRegex) ?? []).map((x) => x.replace(/\\"|"/g, ""));
	const rest = cleaned
		.replace(phraseRegex, " ")
		.replace(/\band\b|\bor\b|\(|\)/g, "")
		.replace(/(^|\s)-|\+/g, " ");
	const words = phrases
		.concat(rest.trim().split(/\s+/))
		.map((x) => x.replace(/[\\:]/g, ""))
		.filter((x) => x !== "");
	return Array.from(new Set(words));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits `text` into parts. Search words match anywhere in a word; when there
 * are none, query terms match whole words only. Matching ignores case and
 * accents ("muller" marks "Müller").
 */
export function highlightParts(text: string, search: string[], query: string[] = []): TextPart[] {
	let kind: HighlightKind;
	let pattern: string;
	if (search.length) {
		kind = "search";
		pattern = search.map((w) => escapeRegExp(fold(w))).join("|");
	} else if (query.length) {
		kind = "query";
		pattern = query.map((t) => `(?<![\\w\\u00AD])${escapeRegExp(fold(t))}(?![\\w\\u00AD])`).join("|");
	} else {
		return text ? [{ text, mark: null }] : [];
	}
	const { folded, positions } = foldWithPositions(text);
	const parts: TextPart[] = [];
	let last = 0;
	for (const m of folded.matchAll(new RegExp(pattern, "gu"))) {
		if (!m[0]) continue;
		const start = positions[m.index ?? 0];
		const end = positions[(m.index ?? 0) + m[0].length];
		if (start < last) continue;
		if (start > last) parts.push({ text: text.slice(last, start), mark: null });
		parts.push({ text: text.slice(start, end), mark: kind });
		last = end;
	}
	if (last < text.length) parts.push({ text: text.slice(last), mark: null });
	return parts;
}
