/**
 * BASE keyword cleaning, a port of legacy/preprocessing/other-scripts/
 * subject_cleaning.R (clean_subject_string and its helpers).
 *
 * Each pattern notes the R engine it came from. TRE patterns (R's default)
 * use the TRE_* classes and the "s" flag (TRE's "." matches newlines); PCRE
 * patterns (perl = TRUE) use ASCII classes. Bracket expressions copied from
 * TRE patterns keep their literal backslashes, e.g. R's "[^\\(;]" excludes
 * "\", "(" and ";".
 */
import tables from "../../resources/subject_tables.json";
import { PCRE_SPACE as PS, TRE_SPACE as S, TRE_WORD as W, rLower, rUpper, striTrim, strsplitFixed, trimws } from "../rtext.js";

const re = (src: string, flags = "") => new RegExp(src, flags);

// --- MeSH -------------------------------------------------------------------

const KEYWORDS_WITH_BRACKETS = /[^;]*\[[^\]]+\][^;]*;?/g;
const TEXT_IN_BRACKETS = /\[[^\]]*\]/g;
const MESH_ROUND_MARKER = re(`${S}*\\(mesh\\)`, "giu");

export const removeKeywordsWithTextInSquareBrackets = (x: string) => x.replace(KEYWORDS_WITH_BRACKETS, "");
export const removeTextInSquareBracketsFromKeywords = (x: string) => x.replace(TEXT_IN_BRACKETS, "");
export const removeMeshRoundBracketMarker = (x: string) => x.replace(MESH_ROUND_MARKER, "");

const DEINVERSION_EXCLUSIONS = new Set<string>(tables.meshDeinversionExclusions);

export function deinvertMeshTerm(term: string): string {
  if (DEINVERSION_EXCLUSIONS.has(term)) return term;
  if (!term.includes(",")) return term;
  return strsplitFixed(term, ",").map(trimws).reverse().join(" ");
}

// PCRE, ignore.case.
const MESH_MARKER = re(`${PS}*(\\[MeSH\\]|\\(mesh\\))${PS}*$`, "i");

export function deinvertMarkedMeshKeywords(subject: string): string {
  if (subject === "") return subject;
  return strsplitFixed(subject, ";")
    .map(trimws)
    .map((kw) => {
      const m = MESH_MARKER.exec(kw);
      if (!m) return kw;
      const bare = kw.slice(0, m.index) + kw.slice(m.index + m[0].length);
      return deinvertMeshTerm(trimws(bare)) + m[0];
    })
    .join("; ");
}

/** (?i:...) for JavaScript engines without inline modifiers. */
const caseless = (s: string) => s.replace(/[A-Za-z]/g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);

const QUALIFIERS = [...new Set(tables.meshQualifiers)];
const QUALIFIER_ALT = QUALIFIERS.map((q, i) => [q, i] as const)
  // R: order(nchar, decreasing = TRUE) is stable, so ties keep list order.
  .sort((a, b) => [...b[0]].length - [...a[0]].length || a[1] - b[1])
  .map(([q]) => caseless(q))
  .join("|");
const UNIT = `(?:${PS}*[/:]${PS}*|${PS}+-${PS}+)\\*?${PS}*(?:${QUALIFIER_ALT})${PS}*\\*?`;
const QUALIFIER_STACK = re(`(?:${UNIT}){2,}`, "g");
const QUALIFIER_SINGLE = re(`(?:${UNIT})(?=${PS}*$|${PS}*[*A-Z0-9(])`, "g");
const MAJOR_TOPIC_MID = re(`${PS}+\\*(?=[A-Za-z(])`, "g");
const TRAILING_STARS = re(`\\*+${S}*$`, "su");

export function stripMeshQualifier(subject: string): string {
  if (subject === "") return subject;
  return strsplitFixed(subject, ";")
    .map(trimws)
    .map((kw) => {
      let s = kw.replace(QUALIFIER_STACK, "; ").replace(QUALIFIER_SINGLE, "; ").replace(MAJOR_TOPIC_MID, "; ");
      s = s.replace(/^\*/, "").replace(TRAILING_STARS, "");
      if (s === kw) return kw;
      return strsplitFixed(s, ";")
        .map((p) => trimws(trimws(p).replaceAll("*", "")))
        .filter((p) => p !== "")
        .join("; ");
    })
    .join("; ");
}

// --- Classification keywords -------------------------------------------------

export const splitKeywords = (subject: string) => strsplitFixed(subject, ";").map(trimws).filter((k) => k !== "");
export const joinKeywords = (keywords: string[]) => keywords.join("; ");

type Filter = (keywords: string[]) => string[];
const without = (test: (k: string) => boolean): Filter => (ks) => ks.filter((k) => !test(k));
const matching = (r: RegExp) => (k: string) => r.test(k);

const dropKeyvalue = without(matching(/^name=/i));
const dropRcdc = without(matching(re(`\\(rcdc\\)${S}*$`, "iu")));
const dropNotElsewhereClassified = without(matching(/not elsewhere classified/i));
const dropFor = without(matching(re(`\\(for(-2020)?\\)${S}*$|^FoR [0-9]+ \\([A-Za-z]|^anzsrc-for ?: ?[0-9]+`, "iu")));
const dropLetteredCodeDashed = without(matching(/^[A-Z]{1,3}[0-9]{2,4} - .+$/s));
const dropHrcs = without(matching(re(`\\(hrcs-[a-z]+\\)${S}*$`, "iu")));
const dropScienceMetrix = without(matching(re(`\\(science-metrix\\)${S}*$`, "iu")));
const dropSdg = without((k) => re(`\\(sdg\\)${S}*$`, "iu").test(k) || /^SDG ?[0-9]+ ?[:.-]/i.test(k));
const dropAcmCcs = without((k) => k.includes("→"));
const dropHalShs = without(matching(/^\[(CHIM|INFO|MATH|NLIN|PHYS|SCCO|SDE|SDU|SDV|SHS|SPI|STAT|QFIN)(\.[A-Z-]+)*\]/));
const dropUrl = without(matching(/^https?:\/\//i));
const dropStandaloneNumber = without(matching(/^[0-9]+([.,-][0-9]+)*$/));
const dropNumericPath = without(matching(/^[0-9/]*\/[0-9/]*$/));
const dropGrantId = without(
  (k) => /^[A-Za-z0-9][A-Za-z0-9-]*(\/[A-Za-z0-9][A-Za-z0-9-]*){2,}$/.test(k) && /[0-9]/.test(k) && !/^[0-9/]+$/.test(k),
);

const normalizeSubject = (x: string) => rUpper(trimws(x).replace(/[‘’']/g, "'"));
const TOULOUSE = new Set(tables.toulouseSubjects.map(normalizeSubject));
const dropLetterDomain = without((k) => TOULOUSE.has(normalizeSubject(k)));

const TOPLEVEL = tables.lccToplevelCaptions as Record<string, string>;
const TOPLEVEL_LETTERS = new Set(Object.keys(TOPLEVEL));
const TOPLEVEL_CAPTION = Object.entries(TOPLEVEL).map(([l, cap]) => re(`^${l} (${cap})\\b`));
const dropLccToplevel = without((k) => TOPLEVEL_LETTERS.has(k) || TOPLEVEL_CAPTION.some((r) => r.test(k)));

const SUBCLASS_WORDS = tables.lccSubclassWords as Record<string, string>;
const SUBCLASS_CODES = Object.keys(SUBCLASS_WORDS);
const SUBCLASS_ALT = SUBCLASS_CODES.map((c, i) => [c, i] as const)
  .sort((a, b) => b[0].length - a[0].length || a[1] - b[1])
  .map(([c]) => c)
  .join("|");
const SUBCLASS_DIGITS = re(`^(${SUBCLASS_ALT})[0-9]{1,4}(\\.[0-9]+)?( |$)`);
const SUBCLASS_CAPTION = re(`^(${SUBCLASS_ALT}) (.+)$`);
const dropLccSubclass = without((k) => {
  if (SUBCLASS_DIGITS.test(k)) return true;
  const m = SUBCLASS_CAPTION.exec(k);
  if (!m) return false;
  const first = rLower(m[2].replace(/[^A-Za-z].*$/s, ""));
  return first !== "" && SUBCLASS_WORDS[m[1]].split(" ").includes(first);
});
const ABBREV = new Set(tables.lccSubclassAbbrev);
const COLLISION_FREE = new Set(SUBCLASS_CODES.filter((c) => !ABBREV.has(c)));
const dropLccSubclassBare = without((k) => COLLISION_FREE.has(k));

const normalizeJelCaption = (x: string) => trimws(rLower(x).replace(/[^a-z0-9]+/g, " "));
const JEL = tables.jelCaptions as Record<string, string>;
const JEL_FALSE_POSITIVES = new Set(tables.jelFalsePositives);
const JEL_NORM = new Map(Object.entries(JEL).map(([c, cap]) => [c, normalizeJelCaption(cap)]));
const JEL_FIRST_NORM = new Map(Object.entries(JEL).map(([c, cap]) => [c, normalizeJelCaption(cap.split(";")[0])]));
const dropJel: Filter = (keywords) =>
  keywords.filter((raw) => {
    const k = trimws(raw);
    if (Object.hasOwn(JEL, k) && !JEL_FALSE_POSITIVES.has(k)) return false;
    const m = /^([A-Z][0-9]{1,2})[ :-]+(.+)$/s.exec(k);
    if (!m || !Object.hasOwn(JEL, m[1])) return true;
    const text = normalizeJelCaption(m[2].replace(/ *\/.*$/s, ""));
    return !(text !== "" && (text === JEL_NORM.get(m[1]) || text === JEL_FIRST_NORM.get(m[1])));
  });
const dropAmsMsc = without(matching(/^[0-9]{2}([A-Z]([0-9]{2}|xx)|-[A-Z]{2})$/));
const dropPacs = without(matching(/^[0-9]{2}\.[0-9]{2}\.[+-]?[A-Za-z]{1,2}$/));

const CLASSIFICATION_FILTERS: Filter[] = [
  dropKeyvalue, dropRcdc, dropNotElsewhereClassified, dropFor, dropLetteredCodeDashed, dropHrcs,
  dropScienceMetrix, dropSdg, dropAcmCcs, dropHalShs, dropUrl, dropStandaloneNumber, dropNumericPath,
  dropGrantId, dropLetterDomain, dropLccToplevel, dropLccSubclass, dropLccSubclassBare, dropJel,
  dropAmsMsc, dropPacs,
];

export function cleanClassificationKeywords(subject: string): string {
  if (subject === "") return subject;
  return joinKeywords(CLASSIFICATION_FILTERS.reduce((ks, f) => f(ks), splitKeywords(subject)));
}

// --- DOAJ LCC caption/code pairs ---------------------------------------------

const LCC_RANGE_CODE = /^[A-Z]{1,3}[0-9]+(\.[0-9]+)?-[0-9]+(\.[0-9]+)?$/;
const LCC_SINGLE_CODE = /^[A-Z]{2,3}[0-9]{1,4}(\.[0-9]+)?$/;
const DOAJ_CAPTIONS = tables.lccDoajCaptionClasses as Record<string, string>;
const SPACES = re(`${S}+`, "gu");

export function dropDoajLccPairs(subject: string): string {
  if (subject === "") return subject;
  const kws = splitKeywords(subject);
  if (kws.length === 0) return subject;
  const classes = new Set<string>();
  for (const k of kws) if (LCC_RANGE_CODE.test(k) || LCC_SINGLE_CODE.test(k)) classes.add(k.replace(/^([A-Z]{1,3}).*$/s, "$1"));
  for (const k of kws) if (TOPLEVEL_LETTERS.has(k)) classes.add(k);
  if (classes.size === 0) return subject;
  return joinKeywords(
    kws.filter((k) => {
      const norm = rLower(trimws(k).replace(SPACES, " "));
      const cc = Object.hasOwn(DOAJ_CAPTIONS, norm) ? DOAJ_CAPTIONS[norm] : undefined;
      if (cc === undefined) return true;
      return ![...classes].some((c) => c.startsWith(cc) || cc.startsWith(c));
    }),
  );
}

// --- The chain ------------------------------------------------------------------

type Step = [RegExp, string];
// R writes many of these patterns with an optional "(;|$)?" ending. TRE does
// not treat a group holding "$" as optional, so in R the ending is required
// (gsub("a(;|$)?", "", "ab") leaves "ab"). The ports below spell it "(;|$)".
const step = (src: string, flags: string, to = ""): Step => [re(src, flags.includes("g") ? flags : flags + "g"), to];

const LEAD: Step[] = [
  step("DOAJ:[^;]*(;|$)", "s"),
  step("/dk/atira[^;]*(;|$)", "s"),
  step("ddc:[0-9]+(;|$)", ""),
  // TRE brackets: [\w\/\:-] is the set { \ w / : - }, [\/0-9\.] is { \ / 0-9 . }.
  step("([\\\\w/:-])*?/ddc/([\\\\/0-9.])*", ""),
  step("[A-Z]{0,3}[0-9]+(\\.[0-9]+)?-[0-9]+(\\.[0-9]+)?(;|$)", ""),
  step("[^\\\\(;]+\\(General\\)(;|$)", ""),
  step("[^\\\\(;]+\\(all\\)(;|$)", ""),
  step("[^:;]+ ?:: ?[^;]+(;|$)", ""),
  step("[^\\\\[;]+\\[[A-Z,0-9]+\\](;|$)", ""),
  step(`Info:${W}+-(${W}+/)+`, "u"),
  // PCRE
  step("(?<![A-Za-z0-9])([a-z]+:[A-Za-z0-9/.-][A-Za-z0-9 /.-]*);?", ""),
  step("FOS ?:[^;]*(;|$)", "s"),
];

const ARXIV_TIMELINE =
  "(cs|econ|eess|math|astro-ph|nlin|q-bio|q-fin|stat)\\.[A-Z]{2}|cond-mat\\.[a-z\\-]+|hep-(ex|lat|ph|th)|math-ph|nucl-(ex|th)|physics\\.[a-z\\-]+|(astro-ph|gr-qc|quant-ph|cond-mat)";
const TIMELINE: Step[] = [step("FOS ", ""), step(ARXIV_TIMELINE, "")];
const OVERVIEW: Step[] = [
  step("FOS [A-Za-z ]+", ""),
  step(
    "(^|;)[\\w ,-]*((cs|econ|eess|math|astro-ph|nlin|q-bio|q-fin|stat)\\.[A-Z]{2}|cond-mat\\.[a-z-]+|physics\\.[a-z-]+|hep-(ex|lat|ph|th)|math-ph|nucl-(ex|th)|astro-ph|gr-qc|quant-ph|cond-mat)",
    "",
    "$1",
  ),
];

const MIDDLE: Step[] = [
  // PCRE
  step("(?<![A-Za-z0-9])([a-z]+:[A-Za-z0-9/.][A-Za-z0-9 /.]*);?", ""),
  // TRE: [\d] is the set { \ d }.
  step("(wikidata)?\\.org/entity/[qQ]([\\\\d]+)?", ""),
  step("</keyword><keyword>", ""),
  step("\\[No keyword\\]", ""),
];

const TAIL: Step[] = [
  // TRE: [^\[] excludes { \ [ }, [^\;] excludes { \ ; }.
  step("\\[[^\\\\[]+\\][^\\\\;]+(;|$)", ""),
  // PCRE
  step("(?<![A-Za-z0-9-])[0-9]{2,} [A-Z]+[^;]*(;|$)?", ""),
  step(" -- ", "", "; "),
  step("[-]{2,}", "", "; "),
  step("[A-Z]\\.[0-9]\\.[0-9]+", ""),
  step(" \\(  ", "", "; "),
  step(`(${W}* ${W}*(\\.)( ${W}* ${W}*)?)`, "u", "; "),
  step("\\. ", "", "; "),
  step(" ?[0-9][:?-]?([0-9]+\\.)+[0-9]+", ""),
  step("(^|; ?)`{2,}", "", "$1"),
  // PCRE
  step("'{2,}(?= ?;|$)", ""),
  step("^; $", ""),
  step(";+", "", ";"),
  step(",+", "", ","),
  step(`${S}+`, "u", " "),
  step("^[; ]+|[; ]+$", ""),
];

const apply = (s: string, steps: Step[]) => steps.reduce((acc, [r, to]) => acc.replace(r, to), s);

/**
 * clean_subject_string for one record. `doaj` marks records of the DOAJ
 * collection (ftdoajarticles), which first lose their LCC caption block.
 */
export function cleanSubject(subject: string, visType: string | null = null, doaj = false): string {
  let s = doaj ? dropDoajLccPairs(subject) : subject;
  s = apply(s, LEAD);
  const timeline = visType === "timeline";
  s = apply(s, timeline ? TIMELINE : OVERVIEW);
  s = apply(s, MIDDLE);
  if (timeline) {
    s = removeKeywordsWithTextInSquareBrackets(s);
  } else {
    s = deinvertMarkedMeshKeywords(s);
    s = cleanClassificationKeywords(s);
    s = removeMeshRoundBracketMarker(s);
    s = removeTextInSquareBracketsFromKeywords(s);
    s = stripMeshQualifier(s);
  }
  return striTrim(apply(s, TAIL));
}
