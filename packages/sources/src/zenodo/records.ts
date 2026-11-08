/** Zenodo search hits to map records. */
import type { SourceRecord } from "../types.js";
import type { ZenodoHit } from "./client.js";

export interface ZenodoRecord extends SourceRecord {
	/** Zenodo's record id (as text). */
	identifier: string;
	link: string;
	/** 1 open access, 0 closed or restricted, 2 unknown (as the map reads it). */
	oa_state: number;
	/** The resource type ("Dataset", "Journal article", ...). */
	resulttype: string[];
	/** The publication date as given (the year is read from it). */
	date: string | null;
	/** Downloads, for the map's "most downloaded" sorting. */
	downloads: number;
	views: number;
}

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	ndash: "–",
	mdash: "—",
	hellip: "…",
	lsquo: "‘",
	rsquo: "’",
	ldquo: "“",
	rdquo: "”",
};

/** Zenodo descriptions are HTML: the text, with tags dropped and entities decoded. */
export function htmlText(html: string): string {
	return html
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, " ")
		.replace(/<[^>]*>/g, "")
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
			if (e[0] === "#") {
				const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
				return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
			}
			return ENTITIES[e.toLowerCase()] ?? m;
		})
		.replace(/\s+/g, " ")
		.trim();
}

const uniq = (xs: string[]) => [...new Set(xs)];

/** Keywords and subject terms, each split at ";" (some records put several in one). */
function subjects(m: NonNullable<ZenodoHit["metadata"]>): string[] {
	const raw = [
		...(Array.isArray(m.keywords) ? m.keywords : []),
		...(Array.isArray(m.subjects) ? m.subjects.map((s) => s?.subject ?? s?.term ?? "") : []),
	];
	return uniq(
		raw
			.flatMap((k) => String(k ?? "").split(/\s*;\s*/))
			.map((k) => k.trim())
			.filter(Boolean),
	);
}

const OA: Record<string, number> = { open: 1, embargoed: 0, restricted: 0, closed: 0 };

/** One hit to a map record. */
export function toZenodoRecord(hit: ZenodoHit, base = "https://zenodo.org"): ZenodoRecord {
	const m = hit.metadata ?? {};
	const id = String(hit.id);
	const title = m.title ? htmlText(m.title) : null;
	const abstract = m.description ? htmlText(m.description) || null : null;
	const keywords = subjects(m);
	const subject = keywords.length ? keywords.join("; ") : null;
	const url = hit.links?.self_html ?? hit.links?.html ?? `${base}/records/${id}`;
	const date = m.publication_date?.trim() || null;
	const publishedIn = m.journal?.title || m.meeting?.title || m.imprint?.publisher || m.publisher || null;
	return {
		id,
		identifier: id,
		title,
		paper_abstract: abstract,
		subject,
		subject_orig: subject,
		authors: (m.creators ?? [])
			.map((c) => c?.name?.trim() ?? "")
			.filter(Boolean)
			.join("; "),
		year: date,
		date,
		published_in: publishedIn,
		url,
		link: url,
		doi: hit.doi || m.doi || "",
		oa_state: m.access_right && m.access_right in OA ? OA[m.access_right] : 2,
		resulttype: m.resource_type?.title ? [m.resource_type.title] : [],
		downloads: hit.stats?.unique_downloads ?? hit.stats?.downloads ?? 0,
		views: hit.stats?.unique_views ?? hit.stats?.views ?? 0,
	};
}

/** Text used for clustering. */
export const zenodoContent = (p: ZenodoRecord) => [p.title, p.paper_abstract, p.subject].filter(Boolean).join(" ");
