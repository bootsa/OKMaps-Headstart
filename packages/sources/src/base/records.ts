/**
 * BASE response parsing and record set-up: rbace's XML parser (bs_parse),
 * etl() and the title-based duplicate marking (mark_duplicates in
 * preprocess.R) that base.R runs before handing records to the Python
 * worker.
 */
import { childElements, findAll, parseXml, textOf } from "../xml.js";
import { rLower, striTrim, strsplitFixed, trimws } from "../rtext.js";
import { cleanSubject } from "./subjects.js";

/** One BASE document: field name to text (multi-valued fields joined with "; "). Missing is null. */
export type BaseDoc = Record<string, string | null>;

export interface BaseResponse {
  docs: BaseDoc[];
  numFound: number;
}

/** rbace bs_parse: <doc> children become fields; <arr> values are joined with "; ". */
export function parseBaseXml(xml: string): BaseResponse {
  const root = parseXml(xml);
  const result = findAll(root, ".//result")[0];
  const docs = findAll(root, ".//doc").map((doc) => {
    const out: BaseDoc = {};
    for (const field of childElements(doc)) {
      const name = field.attrs.name;
      if (name === undefined) continue;
      out[name] = field.name === "arr" ? findAll(field, ".//str").map(textOf).join("; ") : textOf(field);
    }
    return out;
  });
  return { docs, numFound: Number(result?.attrs.numFound ?? docs.length) };
}

const DCTYPENORM: Record<string, string> = {
  "4": "Audio", "11": "Book", "111": "Book part", "13": "Conference object", "16": "Course material",
  "7": "Dataset", "5": "Image/video", "12": "Journal/newspaper", "121": "Journal/newspaper article",
  "122": "Journal/newspaper other content", "17": "Lecture", "19": "Manuscript", "3": "Map",
  "52": "Moving image/video", "2": "Musical notation", F: "Other/Unknown material", "1A": "Patent",
  "14": "Report", "15": "Review", "6": "Software", "51": "Still image", "1": "Text", "18": "Thesis",
  "181": "Thesis: bachelor", "183": "Thesis: doctoral and postdoctoral", "182": "Thesis: master",
};

/** decode_dctypenorm: type codes to names; unknown codes are dropped. */
export function decodeDctypenorm(codes: string | null): string[] {
  if (codes === null) return [];
  return codes.split("; ").flatMap((c) => (Object.hasOwn(DCTYPENORM, c) ? [DCTYPENORM[c]] : []));
}

/** find_dois: a doi.org link (as https) or "". */
export function findDoi(link: string): string {
  return /^https?:\/\/(dx\.)?doi\.org/.test(link) ? link.replace("http:", "https:") : "";
}

/** normalize_dois: "; "-separated https://doi.org/ URLs, or "". */
export function normalizeDois(dois: string): string {
  const parts = strsplitFixed(dois, ";").map(trimws).filter((d) => d !== "");
  if (parts.length === 0) return "";
  return parts.map((d) => "https://doi.org/" + d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")).join("; ");
}

export interface BaseRecord {
  id: string;
  relation: string;
  identifier: string;
  title: string;
  paper_abstract: string;
  published_in: string;
  year: string;
  subject_orig: string;
  subject: string;
  authors: string;
  link: string;
  /** "1" open access, "0" closed, "2" unknown (BASE dcoa). */
  oa_state: string | null;
  url: string;
  relevance: number;
  resulttype: string[];
  type: string;
  typenorm: string;
  doi: string;
  doi_merge: string;
  additional_dois: string;
  lang: string;
  language: string;
  content_provider: string;
  coverage: string;
  collection: string;
  [field: string]: unknown;
}

export interface EtlOptions {
  visType?: string | null;
  repo?: string | null;
  nonPublic?: boolean;
}

const orEmpty = (v: string | null | undefined) => v ?? "";

/** etl() in base.R. Relevance counts down from the number of records. */
export function etl(docs: BaseDoc[], opts: EtlOptions = {}): BaseRecord[] {
  return docs.map((d, i) => {
    const link = orEmpty(d.dclink);
    const doi = findDoi(link);
    const additional = normalizeDois(orEmpty(d.dcdoi));
    const subjectOrig = orEmpty(d.dcsubject);
    const collection = orEmpty(d.dccollection);
    return {
      id: d.dcdocid ?? "",
      relation: orEmpty(d.dcrelation),
      identifier: orEmpty(d.dcidentifier),
      title: orEmpty(d.dctitle).replace(/ \.\.\.$/, ""),
      paper_abstract: orEmpty(d.dcdescription),
      published_in: orEmpty(d.dcsource),
      year: orEmpty(d.dcdate),
      subject_orig: subjectOrig,
      subject: cleanSubject(subjectOrig, opts.visType ?? null, collection === "ftdoajarticles"),
      authors: orEmpty(d.dccreator),
      link,
      oa_state: d.dcoa ?? null,
      url: d.dcdocid ?? "",
      relevance: docs.length - i,
      resulttype: decodeDctypenorm(d.dctypenorm ?? null),
      type: orEmpty(d.dctype),
      typenorm: orEmpty(d.dctypenorm),
      doi,
      doi_merge: doi === "" && additional !== "" && !additional.includes(";") ? additional : doi,
      additional_dois: additional,
      lang: orEmpty(d.dclang),
      language: orEmpty(d.dclanguage),
      content_provider: opts.repo === "fttriple" && opts.nonPublic ? "GoTriple" : orEmpty(d.dcprovider),
      coverage: orEmpty(d.dccoverage),
      collection,
    };
  });
}

/** sanitize_abstract: cut abstracts over 17000 characters. */
export function sanitizeAbstract(abstract: string): string {
  const chars = [...abstract];
  return chars.length > 17000 ? chars.slice(0, 17000).join("") + " [...]" : abstract;
}

/** rearrange_authornames: "Last, First; ..." to "First Last; ...". */
export function rearrangeAuthorNames(authors: string): string {
  return strsplitFixed(authors, "; ")
    .map((a) => {
      const parts = strsplitFixed(a, ", ");
      return striTrim(parts.length === 2 ? `${parts[1]} ${parts[0]}` : a);
    })
    .join("; ");
}

/** Levenshtein distance over code points (stringdist method "lv"). */
export function levenshtein(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

const len = (s: string) => [...s].length;

export interface TitleDuplicates {
  /** Ids to drop: later items of a near-identical title pair, in priority order. */
  candidates: string[];
  /** Per id, the ids with an almost identical title (comma-joined, or ""). */
  duplicates: Map<string, string>;
}

/**
 * deduplicate_titles(metadata, 0). Titles are compared by Levenshtein ratio
 * after records are put in priority order (open access, then longer subject,
 * abstract, authors, venue). Short or one-word titles get the authors added.
 *
 * R quirk kept: when no pair is a strict duplicate (ratio < 0.03), no record
 * is marked as a duplicate at all, even if some pairs are below 1/15.83.
 */
export function deduplicateTitles(records: BaseRecord[]): TitleDuplicates {
  const n = records.length;
  // as.numeric(oa_state), with "2" (unknown) counted as 0; NA sorts last.
  const oa = (r: BaseRecord) => {
    const v = r.oa_state;
    if (v === null || trimws(v) === "") return NaN;
    return v === "2" ? 0 : Number(v);
  };
  const keys = records.map((r) => [oa(r), len(r.subject), len(r.paper_abstract), len(r.authors), len(r.published_in)]);
  const order = records
    .map((_, i) => i)
    .sort((i, j) => {
      for (let k = 0; k < 5; k++) {
        const a = keys[i][k];
        const b = keys[j][k];
        if (Number.isNaN(a) || Number.isNaN(b)) {
          if (Number.isNaN(a) && Number.isNaN(b)) continue;
          return Number.isNaN(a) ? 1 : -1;
        }
        if (a !== b) return b - a;
      }
      return i - j;
    });
  const ids = order.map((i) => records[i].id);
  const titles = order.map((i) => {
    const r = records[i];
    const t = !r.title.includes(" ") || len(r.title) < 15 ? `${r.title} ${rearrangeAuthorNames(r.authors)}` : r.title;
    return [...rLower(t)];
  });

  const NEAR = 1 / 15.83;
  // strict[j]: ids i (ascending) with ratio(i, j) < 0.03, as R's apply over columns.
  const strict: string[][] = ids.map(() => []);
  const near = new Array<boolean>(n).fill(false);
  let anyStrict = false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const longest = Math.max(titles[i].length, titles[j].length);
      // The distance is at least the length difference, so most pairs need no
      // Levenshtein computation.
      if (Math.abs(titles[i].length - titles[j].length) >= NEAR * longest) continue;
      const r = levenshtein(titles[i], titles[j]) / longest;
      if (r < NEAR) near[j] = true;
      if (r < 0.03) {
        strict[j].push(ids[i]);
        strict[i].push(ids[j]);
        anyStrict = true;
      }
    }
  }
  const duplicates = new Map<string, string>();
  ids.forEach((id, k) => {
    if (!duplicates.has(id)) duplicates.set(id, anyStrict ? strict[k].join(",") : "");
  });
  return { candidates: anyStrict ? ids.filter((_, k) => near[k]) : [], duplicates };
}

/** mark_duplicates: adds is_duplicate and duplicates, keeping record order. */
export function markDuplicates(records: BaseRecord[]): (BaseRecord & { is_duplicate: boolean; duplicates: string })[] {
  const { candidates, duplicates } = deduplicateTitles(records);
  const dup = new Set(candidates);
  return records.map((r) => ({ ...r, is_duplicate: dup.has(r.id), duplicates: duplicates.get(r.id) ?? "" }));
}
