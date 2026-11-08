/**
 * Query templates: a SPARQL query with {{placeholders}} that a search
 * fills in. Values are escaped for the place they go, so a search term can
 * never end the string it sits in and change the query.
 *
 *   {{q}}        the search terms, escaped for a "..." string literal
 *   {{q_words}}  the terms as 'word' AND 'word' (Virtuoso bif:contains, DBpedia)
 *   {{limit}}    the most results to ask for (a whole number)
 *   {{lang}}     a language code (en, de, ...), for labels and descriptions
 */

export interface TemplateValues {
	q: string;
	limit: number;
	lang: string;
}

export const PLACEHOLDERS = ["q", "q_words", "limit", "lang"] as const;

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Escapes text for a SPARQL string literal ("..." or '...'). */
export function escapeLiteral(s: string): string {
	return s.replace(/[\\"'\n\r\t\b\f]/g, (c) => {
		switch (c) {
			case "\n":
				return "\\n";
			case "\r":
				return "\\r";
			case "\t":
				return "\\t";
			case "\b":
				return "\\b";
			case "\f":
				return "\\f";
			default:
				return `\\${c}`;
		}
	});
}

/** "coral bleaching" → 'coral' AND 'bleaching' (letters, digits and dashes only). */
export function fullTextWords(q: string): string {
	const words = q
		.split(/\s+/)
		.map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ""))
		.filter((w) => w.length > 0);
	return words.map((w) => `'${w}'`).join(" AND ");
}

/** The placeholders a template uses that are not known (typos). */
export function unknownPlaceholders(template: string): string[] {
	const out = new Set<string>();
	for (const m of template.matchAll(PLACEHOLDER))
		if (!(PLACEHOLDERS as readonly string[]).includes(m[1])) out.add(m[1]);
	return [...out];
}

/** Whether the template uses the search terms at all. */
export function usesSearchTerms(template: string): boolean {
	return [...template.matchAll(PLACEHOLDER)].some((m) => m[1] === "q" || m[1] === "q_words");
}

/** Fills a template; throws on an unknown placeholder. */
export function fillTemplate(template: string, values: TemplateValues): string {
	const unknown = unknownPlaceholders(template);
	if (unknown.length) throw new Error(`Unknown placeholder in the query: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
	const limit = Math.max(1, Math.floor(Number(values.limit) || 100));
	const lang = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(values.lang) ? values.lang.toLowerCase() : "en";
	return template.replace(PLACEHOLDER, (_m, name: string) => {
		switch (name) {
			case "q":
				return escapeLiteral(values.q.trim());
			case "q_words":
				// Safe as it is: only letters, digits, dashes and the quotes around them.
				return fullTextWords(values.q);
			case "limit":
				return String(limit);
			default:
				return lang;
		}
	});
}
