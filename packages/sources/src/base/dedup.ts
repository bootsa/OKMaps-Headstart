/**
 * BASE duplicate merging, a port of filter_duplicates() in
 * legacy/workers/base/src/base.py with its helpers from
 * legacy/workers/common/common/deduplication.py and enrichment.py.
 *
 * Records keep a `label`, their position in the R output, which plays the
 * role of the pandas row index: the passes below key on it, and the final
 * order of the records is by label.
 */
import { PY_SPACE, partialRatio, pyCompare, pyStrip, tokenSortRatio } from "../fuzz.js";
import type { BaseRecord } from "./records.js";

export interface DedupRecord extends BaseRecord {
  is_duplicate: boolean;
  duplicates: string;
  has_dataset: boolean;
  sanitized_authors: string;
  pdf_link_candidates_from_duplicates: string;
  relations: string[] | null;
}

interface Row extends DedupRecord {
  label: number;
  is_anchor: boolean;
  doi_duplicate: boolean;
  link_duplicate: boolean;
  has_relations: boolean;
  doi_version: number | null;
  unversioned_doi: string;
  publisher_doi: string;
  doi_key: string;
}

interface Group {
  labels: number[];
}

// --- DOI helpers -----------------------------------------------------------------

const PATTERN_DOI = /(?:\.?v|\.)([0-9]{1,3})(?:-[0-9]+)?(?=\n?$)/;
const PATTERN_DOI_VERSION_ONLY = /\.?v([0-9]{1,3})(?:-[0-9]+)?(?=\n?$)/;
const DOI_URL_PREFIX = /^https?:\/\/(dx\.)?doi\.org\//i;

export function findVersionInDoi(doi: string): number | null {
  const m = PATTERN_DOI.exec(doi);
  return m ? parseInt(m[1], 10) : null;
}

export function getUnversionedDoi(doi: string): string {
  return doi.split("/").slice(3, 6).join("/").replace(PATTERN_DOI, "");
}

export function getPublisherDoi(doi: string): string {
  const m = /org\/10\.(\p{Nd}+)/u.exec(doi);
  return m ? m[1] : "";
}

function doiCandidates(value: string | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  return value.split(";").map(pyStrip).filter((p) => p !== "");
}

export function normalizeDoiKey(raw: string): string {
  if (pyStrip(raw) === "") return "";
  const bare = pyStrip(raw).replace(DOI_URL_PREFIX, "");
  if (!bare.toLowerCase().startsWith("10.")) return "";
  return bare.toLowerCase().replace(PATTERN_DOI_VERSION_ONLY, "");
}

export function computeDoiKey(doiMerge: string, additionalDois: string, doi: string): string {
  for (const value of [doiMerge, additionalDois, doi]) {
    for (const c of doiCandidates(value)) {
      const key = normalizeDoiKey(c);
      if (key) return key;
    }
  }
  return "";
}

// --- Titles ----------------------------------------------------------------------

const PUNCTUATION = new RegExp(`[^\\p{L}\\p{N}_${PY_SPACE.slice(1, -1)}]`, "gu");
const SPACES = new RegExp(`${PY_SPACE}+`, "gu");
const normalizeTitle = (t: string) => t.toLowerCase().replace(PUNCTUATION, "");
const tieBreakNorm = (t: unknown) => (typeof t === "string" ? pyStrip(normalizeTitle(t).replace(SPACES, " ")) : "");
const DOI_TITLE_CUTOFF = (1 / 15.83) * 100;

/** True when two titles share so little that they are unrelated works under one DOI. */
export const doiTitleFilter = (anchor: string, candidate: string) =>
  partialRatio(normalizeTitle(anchor), normalizeTitle(candidate)) <= 100 - DOI_TITLE_CUTOFF;

type SortKey = [keyof Row, boolean];

const isMissing = (v: unknown) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));

function compareValues(a: unknown, b: unknown, ascending: boolean): number {
  const ma = isMissing(a);
  const mb = isMissing(b);
  if (ma || mb) return ma && mb ? 0 : ma ? 1 : -1; // missing values sort last either way
  const d = typeof a === "number" && typeof b === "number" ? a - b : pyCompare(String(a), String(b));
  return ascending ? d : -d;
}

/** select_anchor_index: the label of the deterministic anchor among candidates. */
function selectAnchor(candidates: Row[], by: SortKey[] = []): number {
  const norms = candidates.map((r) => tieBreakNorm(r.title));
  const stems = norms.map((t) => {
    let stem: string | null = null;
    for (const s of norms) if (s && t.startsWith(s) && (stem === null || [...s].length < [...stem].length)) stem = s;
    return stem ?? t;
  });
  const len = (s: string) => [...s].length;
  const order = candidates.map((_, i) => i);
  order.sort((i, j) => {
    for (const [key, asc] of by) {
      const d = compareValues(candidates[i][key], candidates[j][key], asc);
      if (d !== 0) return d;
    }
    return (
      len(stems[i]) - len(stems[j]) ||
      pyCompare(stems[i], stems[j]) ||
      len(norms[j]) - len(norms[i]) ||
      pyCompare(norms[i], norms[j]) ||
      pyCompare(candidates[i].id, candidates[j].id) ||
      i - j
    );
  });
  return candidates[order[0]].label;
}

// --- Groups ----------------------------------------------------------------------

/** find_duplicate_groups: per record, the rows whose `duplicates` contains its id (substring match). */
function findDuplicateGroups(rows: Row[]): Group[] {
  const seen = new Set<string>();
  const groups: { labels: number[]; key: string[] }[] = [];
  for (const r of rows) {
    const members = rows.filter((o) => o.duplicates.includes(r.id));
    const labels = members.map((o) => o.label);
    const sig = labels.join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    groups.push({ labels, key: members.map((o) => o.id).sort(pyCompare) });
  }
  groups.sort((a, b) => {
    const n = Math.min(a.key.length, b.key.length);
    for (let i = 0; i < n; i++) {
      const d = pyCompare(a.key[i], b.key[i]);
      if (d !== 0) return d;
    }
    return a.key.length - b.key.length;
  });
  return groups.map((g) => ({ labels: g.labels }));
}

/** Rows of `frame` with the given labels, in frame order (df.index.intersection). */
const pick = (frame: Map<number, Row>, labels: number[]) => {
  const set = new Set(labels);
  return [...frame.values()].filter((r) => set.has(r.label));
};

/** Rows grouped by a column value (pandas groupby: sorted keys, original order inside). */
function groupBy(rows: Row[], key: (r: Row) => string): [string, Row[]][] {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return [...m.entries()].sort((a, b) => pyCompare(a[0], b[0]));
}

function markLatestDoi(frame: Map<number, Row>, groups: Group[], versions: Map<number, unknown>) {
  for (const g of groups) {
    const tmp = pick(frame, g.labels);
    const udois = [...new Set(tmp.map((r) => r.unversioned_doi))].filter((u) => u);
    for (const udoi of udois) {
      const tmp2 = tmp.filter((r) => r.unversioned_doi === udoi);
      if (tmp2.length === 0) continue;
      for (const r of tmp2) r.is_anchor = false;
      const latest = selectAnchor(tmp2, [["doi_version", false]]);
      const v = { versions: tmp2.map((r) => r.id), latest: [frame.get(latest)!.id] };
      for (const r of tmp2) versions.set(r.label, v);
      frame.get(latest)!.is_anchor = true;
    }
  }
}

// --- Correction notices ----------------------------------------------------------

const CORRECTION_PREFIX = new RegExp(
  "^(publisher correction|author correction|correction to|corrigendum to|corrigendum|erratum zu|erratum to|erratum" +
    "|retraction note to|retraction note|retraction of|expression of concern on|expression of concern" +
    `|addendum to|addendum)${PY_SPACE}+`,
  "u",
);
const correctionMatch = (title: string) => CORRECTION_PREFIX.exec(normalizeTitle(title));

export function isCorrectionVariant(a: string, b: string): boolean {
  const ma = correctionMatch(a);
  const mb = correctionMatch(b);
  if (Boolean(ma) === Boolean(mb)) return false;
  const [stem, plain] = ma
    ? [normalizeTitle(a).slice(ma[0].length), normalizeTitle(b)]
    : [normalizeTitle(b).slice(mb![0].length), normalizeTitle(a)];
  return stem !== "" && stem === plain;
}

function splitCorrectionGroups(frame: Map<number, Row>): number {
  let n = 0;
  for (const g of findDuplicateGroups([...frame.values()])) {
    const rows = pick(frame, g.labels);
    if (rows.length < 2) continue;
    const prefixed = rows.filter((r) => correctionMatch(r.title));
    const plain = rows.filter((r) => !correctionMatch(r.title));
    if (prefixed.length === 0 || plain.length === 0) continue;
    if (!prefixed.some((p) => plain.some((q) => isCorrectionVariant(p.title, q.title)))) continue;
    for (const [side, other] of [[prefixed, plain], [plain, prefixed]]) {
      const otherIds = new Set(other.map((r) => r.id));
      for (const r of side) r.duplicates = r.duplicates.split(",").filter((m) => m && !otherIds.has(m)).join(",");
      if (!side.some((r) => r.is_anchor)) {
        const a = frame.get(selectAnchor(side))!;
        a.is_anchor = true;
        a.is_duplicate = false;
      }
    }
    n++;
  }
  return n;
}

// --- Enrichment ------------------------------------------------------------------

/** deduplicate_keywords: fold keywords with token_sort_ratio >= threshold, keeping the longer. */
export function deduplicateKeywords(keywords: Iterable<string>, threshold = 85): string[] {
  const unique: string[] = [];
  for (const kw of [...keywords].sort(pyCompare)) {
    let dup = false;
    unique.forEach((existing, i) => {
      if (tokenSortRatio(kw.toLowerCase(), existing.toLowerCase()) >= threshold) {
        dup = true;
        if ([...kw].length > [...existing].length) unique[i] = kw;
      }
    });
    if (!dup) unique.push(kw);
  }
  return unique;
}

const SCHEME_CHARS = /^[A-Za-z0-9+\-.]+$/;
const USES_PARAMS = new Set(["", "ftp", "hdl", "prospero", "http", "imap", "https", "shttp", "rtsp", "rtsps", "rtspu", "sip", "sips", "mms", "sftp", "tel"]);

/** The parts of Python's urllib.parse.urlparse that deduplicate_links uses. */
function urlParse(input: string): { scheme: string; normalized: string } {
  // eslint-disable-next-line no-control-regex
  let url = input.replace(/^[\x00-\x20]+/, "").replace(/[\t\r\n]/g, "");
  let scheme = "";
  const colon = url.indexOf(":");
  if (colon > 0 && /^[A-Za-z]/.test(url) && SCHEME_CHARS.test(url.slice(0, colon))) {
    scheme = url.slice(0, colon).toLowerCase();
    url = url.slice(colon + 1);
  }
  let netloc = "";
  if (url.startsWith("//")) {
    const rest = url.slice(2);
    const end = rest.search(/[/?#]/);
    netloc = end < 0 ? rest : rest.slice(0, end);
    url = end < 0 ? "" : rest.slice(end);
    if (netloc.includes("[") !== netloc.includes("]")) throw new Error("Invalid IPv6 URL");
  }
  let fragment = "";
  const hash = url.indexOf("#");
  if (hash >= 0) [url, fragment] = [url.slice(0, hash), url.slice(hash + 1)];
  let query = "";
  const q = url.indexOf("?");
  if (q >= 0) [url, query] = [url.slice(0, q), url.slice(q + 1)];
  let params = "";
  if (USES_PARAMS.has(scheme) && url.includes(";")) {
    const i = url.includes("/") ? url.indexOf(";", url.lastIndexOf("/")) : url.indexOf(";");
    if (i >= 0) [url, params] = [url.slice(0, i), url.slice(i + 1)];
  }
  return { scheme, normalized: netloc + url + params + query + fragment };
}

/** deduplicate_links: unique links, preferring https over http for the same address. */
export function deduplicateLinks(links: Iterable<string>): string[] {
  const byNormalized = new Map<string, string>();
  const invalid = new Set<string>();
  for (const link of [...links].sort(pyCompare)) {
    let s = pyStrip(link);
    if (!s) continue;
    try {
      let p = urlParse(s);
      if (!p.scheme) {
        if (s.startsWith("//")) {
          s = "http:" + s;
          p = urlParse(s);
        } else {
          invalid.add(s);
          continue;
        }
      }
      const existing = byNormalized.get(p.normalized);
      if (existing === undefined) byNormalized.set(p.normalized, s);
      else if (p.scheme === "https" && urlParse(existing).scheme === "http") byNormalized.set(p.normalized, s);
    } catch {
      invalid.add(s);
    }
  }
  return [...byNormalized.values(), ...[...invalid].sort(pyCompare)];
}

const OA_PRIORITY: Record<string, number> = { "1": 0, "0": 1, "2": 2 };
const splitTrim = (v: string) => v.split(";").map(pyStrip).filter((k) => k !== "");

function enrichAnchors(frame: Map<number, Row>, groups: Group[]) {
  for (const g of groups) {
    const rows = pick(frame, g.labels);
    if (rows.length <= 1) continue;
    const anchors = rows.filter((r) => r.is_anchor);
    if (anchors.length === 0) continue;
    const anchor = frame.get(selectAnchor(anchors))!;

    const subjectOrig = new Set<string>();
    const subject = new Set<string>();
    let abstract: string | null = null;
    let abstractLen = 0;
    let oa: string | null = null;
    let oaPriority = Infinity;
    const links = new Set<string>();
    const dois = new Map<string, string>();
    for (const r of rows) {
      if (r.subject_orig) splitTrim(r.subject_orig).forEach((k) => subjectOrig.add(k));
      if (r.subject) splitTrim(r.subject).forEach((k) => subject.add(k));
      if (r.paper_abstract) {
        const l = [...r.paper_abstract].length;
        if (l > abstractLen || (l === abstractLen && abstract !== null && pyCompare(r.paper_abstract, abstract) < 0)) {
          abstractLen = l;
          abstract = r.paper_abstract;
        }
      }
      const p = r.oa_state === null ? Infinity : (OA_PRIORITY[r.oa_state] ?? Infinity);
      if (p < oaPriority || (p === oaPriority && oa !== null && pyCompare(String(r.oa_state), oa) < 0)) {
        oaPriority = p;
        oa = r.oa_state;
      }
      if (r.link) splitTrim(r.link).forEach((l) => links.add(l));
      for (const raw of [r.doi, r.additional_dois]) {
        if (!raw) continue;
        for (const part of raw.split(";")) {
          const bare = pyStrip(part).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
          if (!bare) continue;
          const key = bare.toLowerCase();
          const existing = dois.get(key);
          if (existing === undefined || pyCompare(bare, existing) < 0) dois.set(key, bare);
        }
      }
    }
    if (subjectOrig.size) anchor.subject_orig = deduplicateKeywords(subjectOrig).sort(pyCompare).join("; ");
    if (subject.size) anchor.subject = deduplicateKeywords(subject).sort(pyCompare).join("; ");
    if (abstract !== null) anchor.paper_abstract = abstract;
    if (oa !== null) anchor.oa_state = oa;
    if (links.size) {
      const unique = deduplicateLinks(links);
      if (unique.length) {
        const own = anchor.link || null;
        anchor.pdf_link_candidates_from_duplicates = unique.filter((l) => l !== own).sort(pyCompare).join("; ");
      }
    }
    if (dois.size) {
      anchor.additional_dois = [...dois.values()].sort(pyCompare).map((d) => "https://doi.org/" + d).join("; ");
    }
  }
}

// --- filter_duplicates -------------------------------------------------------------

const PROVIDER_PRIORITY = (collection: string | null) => {
  if (!collection) return -1;
  const c = collection.toLowerCase();
  return c.includes("ftdatacite") ? 1 : c.includes("cr") ? 2 : 0;
};

/** sanitize_authors: keep the first 14 and the last of more than 15 authors. */
export function sanitizeAuthors(authors: string, n = 15): string {
  const list = authors.split("; ");
  return (list.length > n ? [...list.slice(0, n - 1), ...list.slice(-1)] : list).join("; ");
}

type InputRecord = BaseRecord & { is_duplicate: boolean; duplicates: string; has_dataset: boolean };

/**
 * filter_duplicates: groups duplicates (similar titles, shared DOIs and
 * links, DOI versions), picks one record per group, enriches it from the
 * others and returns the kept records in their original order.
 */
export function filterDuplicates(records: InputRecord[]): DedupRecord[] {
  const seenIds = new Set<string>();
  const rows: Row[] = [];
  records.forEach((r, label) => {
    if (seenIds.has(r.id)) return;
    seenIds.add(r.id);
    rows.push({
      ...r,
      label,
      sanitized_authors: sanitizeAuthors(r.authors),
      is_anchor: false,
      doi_duplicate: false,
      has_relations: false,
      link_duplicate: false,
      pdf_link_candidates_from_duplicates: "",
      duplicates: `${r.id},${r.duplicates}`,
      doi_version: findVersionInDoi(r.doi),
      unversioned_doi: getUnversionedDoi(r.doi),
      publisher_doi: getPublisherDoi(r.doi),
      doi_key: computeDoiKey(r.doi_merge, r.additional_dois, r.doi),
      relations: null,
    });
  });
  const frame = new Map(rows.map((r) => [r.label, r]));

  for (const [key, members] of groupBy(rows, (r) => r.doi_key)) {
    if (!key || members.length < 2) continue;
    const ids = members.map((r) => r.id).sort(pyCompare);
    for (const r of members) {
      const existing = r.duplicates.split(",").filter((p) => p);
      r.duplicates = [...existing, ...ids.filter((m) => !existing.includes(m))].join(",");
    }
  }
  let groups = findDuplicateGroups(rows);

  for (const [key, members] of groupBy(rows, (r) => r.doi_key)) if (key && members.length > 1) members.forEach((r) => (r.doi_duplicate = true));
  for (const [key, members] of groupBy(rows, (r) => r.link)) if (key && members.length > 1) members.forEach((r) => (r.link_duplicate = true));

  // identify_relations
  for (const udoi of new Set(rows.map((r) => r.unversioned_doi))) {
    if (!udoi) continue;
    const tmp = rows.filter((r) => r.identifier.includes(udoi));
    if (tmp.length > 1) {
      const ids = tmp.map((r) => r.id);
      for (const r of tmp) {
        r.relations = ids;
        r.has_relations = true;
      }
    }
  }
  for (const r of rows) if (r.doi !== "" && r.is_duplicate && !r.doi_duplicate) r.is_duplicate = false;
  for (const r of rows) if (r.link !== "" && r.is_duplicate && !r.link_duplicate) r.is_duplicate = false;

  // remove_textual_duplicates_from_different_sources
  for (const g of groups) {
    if (g.labels.length <= 1) continue;
    const tmp = pick(frame, g.labels);
    for (const r of tmp) {
      r.is_duplicate = true;
      r.is_anchor = false;
    }
    if (tmp.some((r) => r.publisher_doi)) tmp.filter((r) => r.publisher_doi !== "").forEach((r) => (r.is_anchor = true));
    else frame.get(selectAnchor(tmp, [["doi", false], ["year", false]]))!.is_anchor = true;
  }
  // add_false_negatives
  for (const r of rows) if (!r.is_duplicate && r.link_duplicate) r.is_duplicate = true;
  for (const r of rows) if (!r.is_duplicate && r.doi_duplicate) r.is_duplicate = true;

  const versions = new Map<number, unknown>();
  markLatestDoi(frame, groups, versions);
  for (const r of rows) if (!r.is_duplicate) r.is_anchor = true;

  // Records that share a link-derived DOI but have unrelated titles are dropped.
  const falsePositives: number[] = [];
  for (const [doi, grp] of groupBy(rows.filter((r) => r.doi_duplicate), (r) => r.doi)) {
    if (!doi || grp.length < 2) continue;
    const anchors = grp.filter((r) => r.is_anchor);
    const anchorLabel = selectAnchor(anchors.length ? anchors : grp);
    const anchorTitle = frame.get(anchorLabel)!.title;
    for (const r of grp) if (r.label !== anchorLabel && doiTitleFilter(anchorTitle, r.title)) falsePositives.push(r.label);
  }
  for (const l of falsePositives) frame.delete(l);

  if (splitCorrectionGroups(frame) > 0) groups = findDuplicateGroups([...frame.values()]);

  const all = [...frame.values()];
  const datasets = new Map(all.filter((r) => r.typenorm === "7").map((r) => [r.label, r]));
  const others = new Map(all.filter((r) => r.typenorm !== "7").map((r) => [r.label, r]));

  // prioritize_OA_and_latest
  for (const g of groups) {
    const tmp = pick(others, g.labels);
    if (tmp.length <= 1) continue;
    for (const r of tmp) r.is_anchor = false;
    const oa = tmp.filter((r) => r.oa_state === "1");
    others.get(selectAnchor(oa.length ? oa : tmp, [["year", false]]))!.is_anchor = true;
  }
  // prioritize_doi_and_provider
  for (const g of groups) {
    const tmp = pick(others, g.labels);
    if (tmp.length <= 1) continue;
    const candidates = tmp.filter((r) => r.doi && r.collection);
    if (candidates.length === 0) continue;
    const best = Math.max(...candidates.map((r) => PROVIDER_PRIORITY(r.collection)));
    const anchorLabel = selectAnchor(candidates.filter((r) => PROVIDER_PRIORITY(r.collection) === best));
    for (const r of tmp) r.is_anchor = r.label === anchorLabel;
  }
  markLatestDoi(datasets, groups, versions);
  for (const r of datasets.values()) if (r.is_anchor || !r.is_duplicate) r.is_anchor = true;

  enrichAnchors(others, groups);
  enrichAnchors(datasets, groups);

  const kept = [...[...others.values()].filter((r) => r.is_anchor), ...[...datasets.values()].filter((r) => r.is_anchor)];
  const keptLabels = new Set(kept.map((r) => r.label));

  // Move an anchor up to the best-ranked position of its group, so it
  // survives the list_size cut when another member ranked higher.
  const seenGroups = new Set<string>();
  const claimed = new Set<number>();
  const renames = new Map<number, number>();
  for (const g of groups) {
    if (g.labels.length <= 1) continue;
    const sig = [...g.labels].sort((a, b) => a - b).join(",");
    if (seenGroups.has(sig)) continue;
    seenGroups.add(sig);
    const anchorLabels = g.labels.filter((l) => keptLabels.has(l)).sort((a, b) => a - b);
    if (anchorLabels.length === 0) continue;
    const min = Math.min(...g.labels);
    if (keptLabels.has(min) || claimed.has(min)) continue;
    const a = anchorLabels.find((l) => l > min);
    if (a !== undefined) {
      renames.set(a, min);
      claimed.add(min);
    }
  }
  const position = (r: Row) => renames.get(r.label) ?? r.label;
  kept.sort((a, b) => position(a) - position(b));

  return kept.map((r) => {
    const {
      label: _l, is_anchor: _a, doi_duplicate: _d, link_duplicate: _k, has_relations: _h, doi_version: _v,
      unversioned_doi: _u, publisher_doi: _p, doi_key: _dk, duplicates: _dup, ...rest
    } = r;
    return rest as unknown as DedupRecord;
  });
}
