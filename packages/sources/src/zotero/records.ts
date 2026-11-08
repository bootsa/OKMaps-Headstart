/**
 * Zotero items to map records: title, abstract, authors, year, DOI, link,
 * tags and where it was published. Notes, attachments and annotations are
 * not documents and are left out.
 */
import type { SourceRecord } from "../types.js";

export interface ZoteroCreator {
	creatorType: string;
	firstName?: string;
	lastName?: string;
	/** Single-field names (institutions). */
	name?: string;
}

/** An item as the API's format=json gives it (only the parts used here). */
export interface ZoteroItem {
	key: string;
	library?: { type: string; id: number; name?: string };
	links?: { alternate?: { href: string } };
	meta?: { parsedDate?: string; creatorSummary?: string };
	data: {
		key?: string;
		itemType: string;
		title?: string;
		abstractNote?: string;
		creators?: ZoteroCreator[];
		date?: string;
		DOI?: string;
		url?: string;
		extra?: string;
		tags?: { tag: string; type?: number }[];
		collections?: string[];
		[field: string]: unknown;
	};
}

export interface ZoteroRecord extends SourceRecord {
	/** The item's key in its library. */
	identifier: string;
	link: string;
	oa_state: number;
	resulttype: string[];
	/** The item's page on zotero.org. */
	zotero_url: string;
}

/** Item types that are not documents of their own. */
export const NOT_DOCUMENTS = new Set(["note", "attachment", "annotation"]);

/** Where an item appeared, by the field its type uses. */
const CONTAINER_FIELDS = [
	"publicationTitle",
	"bookTitle",
	"proceedingsTitle",
	"conferenceName",
	"encyclopediaTitle",
	"dictionaryTitle",
	"websiteTitle",
	"blogTitle",
	"forumTitle",
	"programTitle",
	"seriesTitle",
	"university",
	"institution",
	"repository",
	"publisher",
];

/** Item types with readable names, for the list's document type. */
const TYPE_LABELS: Record<string, string> = {
	journalArticle: "Journal article",
	book: "Book",
	bookSection: "Book section",
	conferencePaper: "Conference paper",
	thesis: "Thesis",
	report: "Report",
	preprint: "Preprint",
	webpage: "Web page",
	dataset: "Dataset",
	manuscript: "Manuscript",
	magazineArticle: "Magazine article",
	newspaperArticle: "Newspaper article",
	blogPost: "Blog post",
	computerProgram: "Software",
	presentation: "Presentation",
	patent: "Patent",
	document: "Document",
};

/** "journalArticle" → "Journal article". */
export function itemTypeLabel(type: string): string {
	return TYPE_LABELS[type] ?? type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

const DOI = /\b10\.\d{4,9}\/[^\s"<>]+/;

/** The DOI field, or one in Extra ("DOI: 10.…", as Zotero keeps it for types without the field). */
export function doiOf(data: ZoteroItem["data"]): string {
	const m = DOI.exec(data.DOI ?? "") ?? /^\s*DOI:\s*(\S+)/im.exec(data.extra ?? "");
	if (!m) return "";
	const d = DOI.exec(m[0]);
	return d ? d[0].replace(/[.,;]+$/, "") : "";
}

/** "2025-04-17", "Spring 1999", "3/2/2011" → the year, or "" when there is none. */
export function zoteroYear(item: Pick<ZoteroItem, "meta" | "data">): string {
	const parsed = item.meta?.parsedDate;
	if (parsed && /^\d{4}/.test(parsed)) return parsed.slice(0, 4);
	const m = /\b(\d{4})\b/.exec(item.data.date ?? "");
	return m ? m[1] : "";
}

/** "Last, First" names of the authors (or, without authors, of every creator). */
export function creatorNames(creators: ZoteroCreator[] = []): string[] {
	const authors = creators.filter((c) => c.creatorType === "author");
	return (authors.length ? authors : creators)
		.map((c) => (c.name ?? [c.lastName, c.firstName].filter((s) => s?.trim()).join(", ")).trim())
		.filter(Boolean);
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Items to map records (documents only), in the order given; duplicates by key are dropped. */
export function toZoteroRecords(items: ZoteroItem[]): { papers: ZoteroRecord[]; content: Record<string, string> } {
	const papers: ZoteroRecord[] = [];
	const content: Record<string, string> = {};
	const seen = new Set<string>();
	for (const item of items) {
		const d = item.data;
		if (!d || NOT_DOCUMENTS.has(d.itemType) || seen.has(item.key)) continue;
		seen.add(item.key);
		const title = clean(d.title) || null;
		const abstract = clean(d.abstractNote) || null;
		const tags = (d.tags ?? []).map((t) => clean(t.tag)).filter(Boolean);
		const subject = tags.length ? [...new Set(tags)].join("; ") : null;
		const doi = doiOf(d);
		const container = CONTAINER_FIELDS.map((f) => clean(typeof d[f] === "string" ? (d[f] as string) : "")).find(
			Boolean,
		);
		const zoteroUrl = item.links?.alternate?.href ?? "";
		const url = clean(d.url) || (doi ? `https://doi.org/${doi}` : zoteroUrl);
		const year = zoteroYear(item);
		papers.push({
			id: item.key,
			identifier: item.key,
			title,
			paper_abstract: abstract,
			subject,
			subject_orig: subject,
			authors: creatorNames(d.creators).join("; "),
			year: year || null,
			published_in: container ?? null,
			url,
			link: url,
			doi,
			oa_state: 2,
			resulttype: [itemTypeLabel(d.itemType)],
			zotero_url: zoteroUrl,
		});
		content[item.key] = [title, abstract, subject].filter(Boolean).join(" ");
	}
	return { papers, content };
}
