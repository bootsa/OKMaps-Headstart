/**
 * Stopword lists and the tm::removeWords equivalent. Port of get_stopwords()
 * (utils.R) and the batched removeWords calls in features.R.
 */
import { rLower, rSort } from "./rstring.js";

export interface StopwordResources {
  /** ISO-639-2 language code -> stopwords (resources/stopwords_iso_cleaned.json). */
  byLanguage: Record<string, string[]>;
  /** resources/additional_stopwords.json */
  additional: string[];
}

export class Stopwords {
  readonly list: string[];
  readonly lowerSet: Set<string>;
  private substrings?: Set<string>;
  private batches?: Array<RegExp | null>;

  constructor(list: string[]) {
    this.list = list;
    this.lowerSet = new Set(list.map(rLower));
  }

  /** stri_detect_fixed(stops, token) for any stop: is `token` a substring of a stopword? */
  isSubstringOfAny(token: string): boolean {
    if (!this.substrings) {
      const set = new Set<string>();
      for (const w of this.list) {
        const chars = Array.from(w);
        for (let i = 0; i < chars.length; i++) {
          let acc = "";
          for (let j = i; j < chars.length; j++) {
            acc += chars[j];
            set.add(acc);
          }
        }
      }
      this.substrings = set;
    }
    return this.substrings.has(token);
  }

  /**
   * tm::removeWords applied batch by batch (1000 words per batch) as in
   * create_corpus(). Words are pasted into a regex unescaped, as tm does; a
   * batch whose regex does not compile is skipped, as R's try() does.
   */
  removeWords(text: string): string {
    if (!this.batches) {
      const batches: Array<RegExp | null> = [];
      // (*UCP)\b with PCRE2 10.42 word characters
      const W = "[\\p{L}\\p{N}_]";
      const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
      for (let i = 0; i < this.list.length; i += 1000) {
        const words = rSort(this.list.slice(i, i + 1000), true);
        try {
          batches.push(new RegExp(`${B}(${words.join("|")})${B}`, "gu"));
        } catch {
          batches.push(null);
        }
      }
      this.batches = batches;
    }
    let out = text;
    for (const re of this.batches) if (re) out = out.replace(re, "");
    return out;
  }
}

/**
 * Stopwords for a map: the map's top languages plus Spanish, English, French
 * and German, then the additional list. Order matters for the batched removal.
 */
export function getStopwords(languages: string[], res: StopwordResources): Stopwords {
  const langs = [...new Set([...languages, "spa", "eng", "fre", "ger"])];
  const list: string[] = [];
  for (const l of langs) if (res.byLanguage[l]) list.push(...res.byLanguage[l]);
  list.push(...res.additional);
  return new Stopwords(list);
}
