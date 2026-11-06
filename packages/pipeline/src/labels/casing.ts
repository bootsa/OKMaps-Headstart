/**
 * Area-label casing: the casing vocabulary (get_type_counts with
 * lower_allcaps_spans, features.R) and the casing restoration
 * (label_casing.R).
 */
import { decodeHtmlEntities, sanitizeCorpusNoise } from "../text/hygiene.js";
import { capitalizeFirst, nchar, rLower } from "../text/rstring.js";

export type TypeCounts = Map<string, number>;

const isAllcaps = (s: string | null | undefined): boolean =>
  !!s && /\p{L}/u.test(s) && !/\p{Ll}/u.test(s);

const isAllcapsPhrase = (s: string): boolean =>
  isAllcaps(s) && s.split(/\s+/u).filter((w) => /\p{L}/u.test(w)).length >= 2;

/** Spans of a paper written in capitals that should not attest capitalised spellings. */
function allcapsSpans(title: string | null, keywords: string | null): string[] {
  const spans: string[] = [];
  if (isAllcaps(title)) spans.push(title!);
  if (keywords) {
    for (const kw of keywords.split(";").map((k) => k.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ""))) {
      if (isAllcapsPhrase(kw)) spans.push(kw);
    }
  }
  return [...new Set(spans.filter((s) => s.length > 0))];
}

export interface CasingPaper {
  id: string;
  title: string | null;
  /** subject_orig when the source has it, else subject. */
  keywords: string | null;
}

/**
 * Token counts over the documents' cleaned text (before lowercasing), with
 * ALL-CAPS titles and multi-word keywords lowered first. Tokens are runs of
 * letters, digits and hyphens of 3+ characters.
 */
export function typeCounts(unlowered: Map<string, string>, papers: CasingPaper[]): TypeCounts {
  const docs = new Map(unlowered);
  for (const p of papers) {
    const spans = allcapsSpans(p.title, p.keywords);
    if (!spans.length || !docs.has(p.id)) continue;
    let text = docs.get(p.id)!;
    for (const span of spans.map((s) => sanitizeCorpusNoise(decodeHtmlEntities(s)))) {
      const at = text.indexOf(span);
      if (at >= 0) text = text.slice(0, at) + rLower(span) + text.slice(at + span.length);
    }
    docs.set(p.id, text);
  }
  const counts: TypeCounts = new Map();
  for (const text of docs.values()) {
    for (const tok of text.split(/[^\p{L}\p{N}-]/u)) {
      if (nchar(tok) < 3) continue;
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return counts;
}

const CAPS_ATTESTATION_FLOOR = 2;

const byteCompare = (a: string, b: string): number => {
  const ca = Array.from(a);
  const cb = Array.from(b);
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    const d = ca[i].codePointAt(0)! - cb[i].codePointAt(0)!;
    if (d) return d;
  }
  return ca.length - cb.length;
};

const rUpper = (s: string) => Array.from(s).map((c) => {
  const u = c.toUpperCase();
  return Array.from(u).length === 1 ? u : c;
}).join("");

/** Index of type counts by lowercased token, built once per map. */
export class CasingVocabulary {
  private byLower = new Map<string, Array<[string, number]>>();
  constructor(counts: TypeCounts) {
    for (const [t, c] of counts) {
      const k = rLower(t);
      if (!this.byLower.has(k)) this.byLower.set(k, []);
      this.byLower.get(k)!.push([t, c]);
    }
  }

  /** lookup_case(): the spelling to use for `x`, or undefined when unknown. */
  lookup(x: string): string | undefined {
    const lower = rLower(x);
    const all = this.byLower.get(lower);
    if (!all) return undefined;
    let lowerN = 0;
    for (const [v, c] of all) if (v === lower) lowerN += c;
    const rest = all.filter(([v]) => v !== lower);
    if (!rest.length) return lower;
    rest.sort((a, b) => b[1] - a[1] || byteCompare(a[0], b[0]));
    const caps = rest.map(([v]) => v === rUpper(v) && /\p{L}/u.test(v));
    let pick = 0;
    if (caps[0] && rest[0][1] < CAPS_ATTESTATION_FLOOR && caps.some((c) => !c)) pick = caps.findIndex((c) => !c);
    if (lowerN > 0 && rest[pick][1] < 2 * lowerN) return lower;
    return rest[pick][0];
  }

  /** match_keyword_case(): whole token first, then its alphanumeric runs. */
  matchCase(token: string): string {
    let x = token;
    const stripped = x.replace(/^-+|-+$/g, "");
    if (stripped.length) x = stripped;
    const hit = this.lookup(x);
    if (hit !== undefined) return hit;
    if (!/[^\p{L}\p{N}]/u.test(x)) return x;
    return x.replace(/[\p{L}\p{N}]+/gu, (run) => this.lookup(run) ?? run);
  }

  /** fix_cluster_labels() for one label. */
  fixLabel(label: string): string {
    const phrases = label.length ? label.split(", ") : [];
    const fixed = phrases.map((p) => capitalizeFirst(p.split(" ").map((w) => this.matchCase(w)).join(" ")));
    return fixed.join(", ").replace(/,+/g, ",");
  }
}
