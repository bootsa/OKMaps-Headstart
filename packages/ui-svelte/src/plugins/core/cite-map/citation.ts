/** The citation of a whole map (old CitationModal). */
import type { MapState } from "../../../data/state.svelte";
import { t } from "../../../i18n/strings";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-06 14:05:09" (the context's timestamp) as "6 Nov 2026"; "" if unreadable. */
export function citationDate(timestamp: unknown): string {
	if (typeof timestamp !== "string" || !timestamp) return "";
	let d = new Date(timestamp);
	if (Number.isNaN(d.getTime())) d = new Date(timestamp.trim().replace(/\s+/, "T"));
	if (Number.isNaN(d.getTime())) return "";
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The page's address without ?embed (a citation points at the full page). */
export function pageLink(href: string): string {
	try {
		const url = new URL(href);
		url.searchParams.delete("embed");
		return url.toString();
	} catch {
		return href;
	}
}

function fill(template: string, values: Record<string, string>): string {
	return template.replace(/\$\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
}

export function mapCitation(map: MapState, href: string, year = new Date().getFullYear()): string {
	const ctx = map.map.context;
	let query = [ctx.query, ctx.q_advanced].filter((q) => typeof q === "string" && q).join(" ");
	if (query.length > 100) query = `${query.slice(0, 100)}[..]`;
	const custom = map.config.customTitle ?? (typeof ctx.custom_title === "string" ? ctx.custom_title : null);
	if (custom) query = custom;
	const link = pageLink(href);
	const cite = map.view.citation;
	if (cite.text) return cite.text(query, year, link);
	const date = citationDate(ctx.timestamp);
	const text = fill(t(map.strings, "citation_template"), {
		year: String(year),
		type: cite.type,
		query,
		source: link,
		date,
	});
	return date ? text : text.replace(" [].", ".");
}

/** The modal's title and the line above the citation. */
export function citationLabels(map: MapState): { title: string; instruction: string } {
	const { kind } = map.view.citation;
	return { title: t(map.strings, `cite_title_${kind}`), instruction: t(map.strings, `cite_vis_${kind}`) };
}
