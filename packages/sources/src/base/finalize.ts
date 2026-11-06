/**
 * The last part of BaseClient.execute_search (legacy/workers/base/src/base.py)
 * after duplicate merging: annotations, the list_size cut, ordering by id,
 * journal fields parsed from published_in (parsers.py), and the clustering
 * text.
 *
 * The patterns come from Python's re module, which is Unicode-aware: \w, \s
 * and \d are spelled out below, and "$" also matches before a final newline.
 */
import { PY_SPACE, pyCompare, pyStrip } from "../fuzz.js";
import type { DedupRecord } from "./dedup.js";

const W = "\\p{L}\\p{N}_";
const S = PY_SPACE.slice(1, -1);
const D = "\\p{Nd}";
const END = "(?=\\n?$)";
const py = (src: string) =>
	new RegExp(src.replace(/\\w/g, `[${W}]`).replace(/\\s/g, `[${S}]`).replace(/\\d/g, D).replace(/\$$/, END), "iu");
// Inside brackets the classes are inserted without their own brackets.
const cls = (s: string) => s.replace(/\\w/g, W).replace(/\\s/g, S).replace(/\\d/g, D);

const ANNOTATIONS = new RegExp(`([A-Za-z]+:[${W}'\\- ]+);?`, "gu");

/** parse_annotations: the first value of each "type:value" annotation in the subject. */
export function parseAnnotations(subjectOrig: string | null): Record<string, string> {
	if (typeof subjectOrig !== "string") return {};
	const out: Record<string, string> = {};
	for (const m of subjectOrig.matchAll(ANNOTATIONS)) {
		const [key, value] = m[1].split(":");
		if (!Object.hasOwn(out, key)) out[key] = value;
	}
	return out;
}

export interface JournalFields {
	source: string | null;
	volume: string | null;
	issue: string | null;
	page: string | null;
	issn: string | null;
}

const CROSSREF = py(
	`^(.*?)( ; (volume (\\w+(-\\w+)?),?\\s*)?(issue ([${cls("-\\w\\s")}]+([-/][${cls("\\w\\s")}]+)?),?\\s*)?` +
		`(page ([${cls("-,.\\w")}]+(-[${cls("-,.\\w")}]+)?),?\\s*)?)?( ; ISSN (\\d{4}-\\d{3}[${cls("\\d\\w")}]( \\d{4}-\\d{3}[${cls("\\d\\w")}])?))?$`,
);
const CCSD = py(
	`^((E?ISSN): (\\d{4}-\\d{3}[${cls("\\d")}X])\\s*;\\s*)?((E?ISSN): (\\d{4}-\\d{3}[${cls("\\d")}X])\\s*;\\s*)?([^;]*).*?` +
		`(, [12]\\d{3}(, (\\d+)( \\((\\d+(\\s*-\\s*\\d+)?)\\))?)?(, pp?\\.\\s*e?(\\d+(\\s*-+\\s*\\d+)?))?).*$`,
);
const DOAJ = py(`^(.*?)(,?\\s*Vol (\\d+))?(,?\\s*Iss (\\d+(-\\d+)?))?(,\\s*P?p e?(\\d+(-\\d+)?))? \\(\\d+\\)$`);
const ZENODO = py(`^(.*?) (\\d+)(\\s?\\((\\d+)\\))? ?(\\d+(\\s?-\\s?\\d+)?)?\\s*$`);

const g = (m: RegExpExecArray, i: number) => m[i] ?? null;

/** improved_df_parsing for one record: volume, issue, pages and ISSN by repository. */
export function parseJournalFields(repo: string, publishedIn: string): JournalFields {
	const empty: JournalFields = { source: null, volume: null, issue: null, page: null, issn: null };
	if (repo.startsWith("cr")) {
		const m = CROSSREF.exec(publishedIn);
		if (!m) return { ...empty, source: publishedIn };
		return { source: m[1], volume: g(m, 4), issue: g(m, 7), page: g(m, 10), issn: g(m, 13) };
	}
	if (repo === "ftccsdartic") {
		const m = CCSD.exec(publishedIn);
		if (!m) return empty;
		let issn = g(m, 3);
		if (m[6] !== undefined) issn = (issn !== null && issn.length > 0 ? issn + " " : (issn ?? "")) + m[6];
		return { source: g(m, 7), volume: g(m, 10), issue: g(m, 12), page: g(m, 15), issn };
	}
	if (repo === "ftdoajarticles") {
		const m = DOAJ.exec(publishedIn);
		if (!m) return empty;
		return { source: g(m, 1), volume: g(m, 3), issue: g(m, 5), page: g(m, 8), issn: null };
	}
	if (repo === "ftzenodo") {
		const m = ZENODO.exec(publishedIn);
		if (!m) return empty;
		return { source: g(m, 1), volume: g(m, 2), issue: g(m, 4), page: g(m, 5), issn: null };
	}
	return empty;
}

export type BasePaper = DedupRecord & JournalFields & { annotations: Record<string, string>; repo: string };

export interface FinalizeOptions {
	/** Number of records to keep (list_size); default 100. */
	listSize?: number;
	/** BASE content provider names to internal names (from the BASE repository list). */
	contentProviders?: Map<string, string>;
	/** Cluster on this metadata field or annotation type instead of the text. */
	customClustering?: string | null;
}

/** Turns deduplicated records into the papers and clustering text sent to the map pipeline. */
export function finalizeBaseRecords(
	records: DedupRecord[],
	opts: FinalizeOptions = {},
): { papers: BasePaper[]; content: Record<string, string> } {
	const providers = opts.contentProviders ?? new Map<string, string>();
	const papers = records
		.map((r) => ({ ...r, annotations: parseAnnotations(r.subject_orig) }))
		.slice(0, opts.listSize ?? 100)
		.sort((a, b) => pyCompare(a.id, b.id))
		.map((r) => {
			const repo = providers.get(r.content_provider) ?? "";
			return { ...r, repo, ...parseJournalFields(repo, r.published_in) };
		});
	const content: Record<string, string> = {};
	const cc = opts.customClustering;
	for (const p of papers) {
		let text: unknown;
		if (cc != null) text = Object.hasOwn(p, cc) ? (p as Record<string, unknown>)[cc] : (p.annotations[cc] ?? "");
		else text = [p.title, p.paper_abstract, p.subject_orig, p.published_in, p.sanitized_authors].join(" ");
		content[p.id] = pyStrip(Array.isArray(text) ? text.join(", ") : String(text));
	}
	return { papers, content };
}
