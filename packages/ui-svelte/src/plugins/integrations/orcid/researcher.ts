/**
 * ORCID researcher maps: the title, employment, list metrics and the
 * researcher's details and metrics, from the map's `author` record (old
 * Heading.tsx, Employment.tsx, OrcidMetrics.tsx and the researcher modals).
 */

import type { ContextItem, MapTitle, Paper } from "@okmaps/core";
import { outsideReferences, sliceText, socialMentions, t } from "@okmaps/core";
import type { MapState } from "../../../data/state.svelte";
import type { PaperMetric } from "../../index";

type Rec = Record<string, unknown>;

/** A text field, or "" for anything that isn't text or a number. */
export const text = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

const records = (v: unknown): Rec[] =>
	Array.isArray(v) ? v.filter((r): r is Rec => !!r && typeof r === "object" && !Array.isArray(r)) : [];

export const isWebUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);

const MAX_LENGTH_ORCID = 85;
const MAX_ROLE_LENGTH = 18;

/** "Name (0000-0001-...)" as the title of an ORCID map, if the map has either. */
export function orcidTitle(map: MapState): MapTitle | null {
	if (map.config.service !== "orcid") return null;
	const name = text(map.author.author_name);
	const id = text(map.author.orcid_id);
	if (!name && !id) return null;
	const full = [name, id ? `(${id})` : ""].filter(Boolean).join(" ");
	const label = t(map.strings, map.config.isAuthorview ? "overview_authors_label" : "overview_label");
	return { kind: "standard", label, text: sliceText(full, MAX_LENGTH_ORCID), full };
}

/** The current role and organisation, cut to 18 characters with the rest on hover. */
export function employmentItems(map: MapState): ContextItem[] {
	const job = map.author.employment;
	if (!job || typeof job !== "object") return [];
	const items: ContextItem[] = [];
	for (const id of ["role", "organization"] as const) {
		const value = text((job as Rec)[id]);
		if (!value) continue;
		const short = sliceText(value, MAX_ROLE_LENGTH);
		items.push(
			short === value
				? { id: `author_${id}`, text: value }
				: { id: `author_${id}`, text: short, tooltip: value, more: true },
		);
	}
	return items;
}

/** Citations, social media mentions and references outside academia (old OrcidMetrics). */
export function orcidMetrics(map: MapState, paper: Paper): PaperMetric[] {
	const s = map.strings;
	return [
		{ id: "citations", value: paper.citations, label: t(s, "citations_count_label") },
		{ id: "social", value: socialMentions(paper.raw), label: t(s, "social_media_count_label") },
		{ id: "references", value: outsideReferences(paper.raw), label: t(s, "references_count_label") },
	];
}

/** "2019 - present", "2019 - 2021" or just the one date. */
export function dateRange(item: Rec, openEnded = true): string {
	const start = text(item.start_date);
	const end = text(item.end_date) || (openEnded ? "present" : "");
	if (start && start === end) return end;
	if (start) return end ? `${start} - ${end}` : start;
	return end === "present" ? "" : end;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One entry of a section: its line, and a link for funding and web pages. */
export interface Entry {
	text: string;
	href?: string;
	linkText?: string;
}

export interface Section {
	id: string;
	title: string;
	subtitle?: string;
	entries: Entry[];
}

const job = (item: Rec): Entry => ({
	text: [dateRange(item), text(item.role), text(item.organization), text(item.organization_address)]
		.filter(Boolean)
		.join(" / "),
});

function funding(item: Rec): Entry {
	const amount = item.amount && typeof item.amount === "object" ? (item.amount as Rec) : {};
	const line = [
		dateRange(item),
		text(item.type) ? capitalize(text(item.type)) : "",
		text(item.organization) ? `Funder: ${text(item.organization)}` : "",
		text(amount.value) && text(amount.currency) ? `Amount: ${text(amount.value)} ${text(amount.currency)}` : "",
	]
		.filter(Boolean)
		.join(" / ");
	const title = text(item.title);
	return isWebUrl(item.url)
		? { text: line, href: item.url, linkText: title || item.url }
		: { text: [title, line].filter(Boolean).join("\n") };
}

/** The researcher details modal's sections, in the old order. */
export function researcherSections(author: Rec): Section[] {
	return [
		{ id: "employments", title: "Employment", entries: records(author.employments).map(job) },
		{
			id: "services",
			title: "Professional activities",
			subtitle: "Services",
			entries: records(author.services).map(job),
		},
		{ id: "educations", title: "Education & qualifications", entries: records(author.educations).map(job) },
		{ id: "funds", title: "Funding", entries: records(author.funds).map(funding) },
		{
			id: "links",
			title: "Links",
			entries: records(author.researcher_urls)
				.filter((l) => isWebUrl(l.url))
				.map((l) => ({ text: "", href: l.url as string, linkText: text(l.url_name) || (l.url as string) })),
		},
		{
			id: "distinctions",
			title: "Distinctions / awards",
			entries: records(author.distinctions).map((d) => ({
				text: [dateRange(d, false), text(d.role)].filter(Boolean).join(" / "),
			})),
		},
	];
}

/** A number for the metrics modal, or null when the author record has none (0 counts as none, as before). */
export function authorNumber(author: Rec, field: string): number | null {
	const n = Number(author[field]);
	return author[field] === null || author[field] === "" || !Number.isFinite(n) || n === 0 ? null : n;
}
