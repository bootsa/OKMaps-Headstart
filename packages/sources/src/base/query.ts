/**
 * BASE query building, a port of preprocess_query() and the first half of
 * get_papers() in legacy/preprocessing/other-scripts/base.R.
 *
 * The patterns come from R's perl = TRUE engine, so \s, \S and \b are
 * ASCII-only; PS / NS spell that out for JavaScript.
 */
import { PCRE_SPACE as PS } from "../rtext.js";

const NS = "[^\\t\\n\\v\\f\\r ]";
const OUTSIDE_QUOTES_START = '(?!\\B"[^"]*)';
const OUTSIDE_QUOTES_END = '(?![^"]*"\\B)';

const PLUSES = new RegExp(`${OUTSIDE_QUOTES_START}[+]+${OUTSIDE_QUOTES_END}`, "g");
const MINUSES = new RegExp(`${OUTSIDE_QUOTES_START}((^|${PS}))[-]+${PS}*${OUTSIDE_QUOTES_END}`, "g");
const SPACES = new RegExp(`${OUTSIDE_QUOTES_START}${PS}{2,}${OUTSIDE_QUOTES_END}`, "g");
const TRIM = new RegExp(`^${PS}+|${PS}+$`, "g");
const TEXTUS = new RegExp(
  '(["]+(.*?)["]+)|(?<=\\(\\b|\\+|-"\\b|' + PS + "-\\b|^-\\b)|(?!or\\b|and\\b|[-]+[\"(]*\\b)(?<!" + NS + ")(?=" + NS + ")(?!\\(|\\+)",
  "g",
);

/**
 * R's gsub (perl = TRUE) adds no replacement for an empty match that starts
 * where the previous match ended; JavaScript does. This replace follows R.
 */
function rGsub(s: string, pattern: RegExp, replace: (m: RegExpExecArray) => string): string {
  let out = "";
  let pos = 0;
  let lastEnd = -1;
  pattern.lastIndex = 0;
  for (let m = pattern.exec(s); m; m = pattern.exec(s)) {
    const start = m.index;
    const end = start + m[0].length;
    out += s.slice(pos, start);
    if (end > lastEnd) {
      out += replace(m);
      lastEnd = end;
    }
    pos = end;
    if (m[0].length === 0) {
      if (end >= s.length) break;
      const step = s.codePointAt(end)! > 0xffff ? 2 : 1;
      out += s.slice(end, end + step);
      pos = end + step;
      pattern.lastIndex = pos;
    }
  }
  return out + s.slice(pos);
}

/** preprocess_query: normalise operators and prefix every term with "textus:" (verbatim search). */
export function preprocessQuery(query: string): string {
  let q = rGsub(query, PLUSES, () => " ");
  q = rGsub(q, MINUSES, (m) => `${m[1]}-`);
  q = rGsub(q, SPACES, () => " ");
  q = q.replace(TRIM, "");
  return rGsub(q, TEXTUS, (m) => `textus:${m[1] ?? ""}`);
}

/** R sanitize_query: drop backslashes, turn typographic quotes into ". */
export function sanitizeQuery(q: string): string {
  return q.replace(/\\/g, "").replace(/[“”„]/g, '"');
}

/** Metadata fields that can drive custom clustering (base.R fieldmapper). */
export const FIELD_MAPPER: Record<string, string> = {
  relation: "dcrelation",
  identifier: "identifier",
  title: "dctitle",
  paper_abstract: "dcdescription",
  published_in: "dcsource",
  year: "dcdate",
  subject: "dcsubject",
  authors: "dccreator",
  link: "dclink",
  oa_state: "dcoa",
  url: "dcdocid",
  relevance: "relevance",
  resulttype: "dctypenorm",
  type: "dctype",
  typenorm: "dctypenorm",
  doi: "doi",
  lang: "dclang",
  language: "dclanguage",
  content_provider: "dcprovider",
  coverage: "dccoverage",
  collection: "dccollection",
};

export const RETURN_FIELDS =
  "dcdocid,dctitle,dcdescription,dcsource,dcdate,dcsubject,dccreator,dclink,dcoa,dcidentifier,dcrelation,dctype,dctypenorm,dcprovider,dclang,dclanguage,dccoverage,dccollection,dcdoi";

export interface BaseParams {
  q?: string | null;
  from?: string | null;
  to?: string | null;
  /** BASE dctypenorm codes, e.g. "121" (journal article). */
  document_types?: string[] | null;
  sorting?: string | null;
  limit?: number;
  list_size?: number;
  vis_type?: string | null;
  exclude_date_filters?: boolean | string | null;
  /** BASE language codes; ["all-lang"] means no filter. */
  lang_id?: string[] | null;
  q_advanced?: string | null;
  q_advanced_only?: boolean | string | null;
  min_descsize?: number | null;
  /** Content provider (BASE "target"), e.g. "ftunivlausanne". */
  repo?: string | null;
  coll?: string | null;
  custom_clustering?: string | null;
}

/** The parameters of one BASE PerformSearch call (rbace::bs_search), without the API key. */
export interface BaseRequest {
  query: string;
  hits: number;
  offset: number;
  fields: string;
  sortby: string;
  filter: string;
  target: string | null;
  coll: string | null;
  /** GoTriple (repo "fttriple"): adds triple=1. */
  non_public: boolean;
}

const isTrue = (v: unknown) => v === true || v === "true";

/** Builds the first BASE request for a search, as get_papers() does. */
export function buildBaseRequest(params: BaseParams, offset = 0): BaseRequest {
  const q = params.q == null ? null : sanitizeQuery(params.q);
  const exact = q === null ? null : preprocessQuery(q);
  const documentTypes = `dctypenorm:(${(params.document_types ?? []).join(" OR ")})`;
  let query = exact !== null && exact !== "" ? `(${exact}) ${documentTypes}` : documentTypes;

  const excludeDates = params.vis_type !== "timeline" && isTrue(params.exclude_date_filters);
  if (!excludeDates) query = `dcdate:[${params.from ?? ""} TO ${params.to ?? ""}] ${query}`;

  const lang = params.lang_id ?? [];
  if (lang.length > 0 && lang[0] !== "all-lang") query += ` dclang:(${lang.join(" OR ")})`;

  const advanced = params.q_advanced == null ? null : sanitizeQuery(params.q_advanced);
  if (advanced !== null) query += ` ${advanced}`;
  if (isTrue(params.q_advanced_only)) query = advanced ?? "";

  const cc = params.custom_clustering;
  if (cc != null) {
    query += Object.hasOwn(FIELD_MAPPER, cc) ? ` ${FIELD_MAPPER[cc]}:*` : ` dcsubject:${cc}* textus:"${cc}:" ${cc}:*`;
  }

  return {
    query,
    hits: params.limit ?? 120,
    offset,
    fields: RETURN_FIELDS,
    sortby: params.sorting === "most-recent" ? "dcyear desc" : "",
    filter: `descsize:[${params.min_descsize ?? 300} TO *]`,
    target: params.repo ?? null,
    coll: params.coll ?? null,
    non_public: params.repo === "fttriple",
  };
}

/** URL query parameters for a request (the gateway adds the API key). */
export function baseRequestParams(req: BaseRequest): URLSearchParams {
  const sp = new URLSearchParams({ func: "PerformSearch", query: req.query });
  if (req.coll !== null) sp.set("coll", req.coll);
  if (req.target !== null) sp.set("target", req.target);
  sp.set("fields", req.fields);
  sp.set("hits", String(req.hits));
  sp.set("offset", String(req.offset));
  sp.set("sortby", req.sortby);
  sp.set("facet_limit", "100");
  sp.set("filter", req.filter);
  if (req.non_public) sp.set("triple", "1");
  return sp;
}
