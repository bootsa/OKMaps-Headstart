/** Search, filter and sort of the paper list (old utils/data.ts). */
import type { Paper } from "./types";

export interface ListQuery {
  /** Free text; every word must match. */
  search: string;
  /** "all", "open_access", "publication", "dataset". */
  filter: string;
  /** Sort field from the config's sortOptions. */
  sort: string;
  /** Only this area (its uri), when zoomed in. */
  area?: string | null;
  /** Only these paper ids (a selected stream). */
  ids?: string[] | null;
  /** Only this paper (its safeId), when one is selected. */
  paper?: string | null;
}

export function searchWords(text: string): string[] {
  return text
    .split(" ")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

const NON_TEXT_TYPES = [
  "dataset",
  "musical notation",
  "map",
  "audio",
  "image/video",
  "still image",
  "moving image/video",
  "software",
];
const UNKNOWN_TYPE = "other/unknown material";
const isNonTextType = (t: string) => NON_TEXT_TYPES.includes(t.toLowerCase());

/** Datasets, media and software (the old isNonTextDocument rule). */
export function isNonText(p: Paper): boolean {
  const known = p.resultType.filter((t) => t.toLowerCase() !== UNKNOWN_TYPE);
  if (known.length === p.resultType.length)
    return p.resultType.some(isNonTextType);
  return known.length === 0 || isNonTextType(known[0]);
}

function haystack(p: Paper): string {
  const parts = [
    p.title,
    p.authorsString,
    p.publishedIn,
    p.year,
    p.keywords,
    p.tags.join(","),
    p.comments.map((c) => `${c.comment} ${c.author ?? ""}`).join(" "),
    p.resultType.join(","),
    p.abstract,
  ].map((s) => s.toLowerCase().trim());
  const nonText = isNonText(p);
  if (p.oa) {
    parts.push("open access");
    if (!nonText) parts.push("pdf");
  }
  if (p.freeAccess) parts.push("free access");
  if (nonText) parts.push("file");
  if (p.place?.country) parts.push(p.place.country.toLowerCase());
  return parts.join(" ");
}

function filterFn(filter: string): (p: Paper) => boolean {
  switch (filter) {
    case "open_access":
      return (p) => p.oa;
    case "publication":
      return (p) => p.resultType.includes("publication");
    case "dataset":
      return (p) => p.resultType.includes("dataset");
    default:
      return () => true;
  }
}

const DESC = new Set(["year", "relevance", "citations", "readers"]);

function sortValue(p: Paper, field: string): string | number | undefined {
  switch (field) {
    case "title":
      return p.title;
    case "authors":
      return p.authorsString;
    case "year":
      return p.year;
    case "relevance":
      return p.relevance;
    case "readers":
      return p.readers;
    case "citations":
      return p.citations === "n/a" ? undefined : p.citations;
    case "area":
      return p.area;
    default:
      return undefined;
  }
}

/** Like the old stringCompare: missing values last, numbers by value, text case-insensitively. */
export function compare(a: unknown, b: unknown, order: "asc" | "desc"): number {
  const missing = (v: unknown) =>
    v === undefined || v === null || v === "" || v === "n/a";
  if (missing(a) && missing(b)) return 0;
  if (missing(a)) return 1;
  if (missing(b)) return -1;
  const sign = order === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return sign * (a - b);
  return sign * String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

export function listPapers(papers: Paper[], q: ListQuery): Paper[] {
  let out = papers;
  if (q.paper) out = out.filter((p) => p.safeId === q.paper);
  if (q.area != null) out = out.filter((p) => p.areaUri === q.area);
  if (q.ids) {
    const ids = new Set(q.ids);
    out = out.filter((p) => ids.has(p.id));
  }
  out = out.filter(filterFn(q.filter));
  const words = searchWords(q.search);
  if (words.length)
    out = out.filter((p) => {
      const text = haystack(p);
      return words.every((w) => text.includes(w));
    });
  const order = DESC.has(q.sort) ? "desc" : "asc";
  return [...out].sort((a, b) =>
    compare(sortValue(a, q.sort), sortValue(b, q.sort), order),
  );
}
