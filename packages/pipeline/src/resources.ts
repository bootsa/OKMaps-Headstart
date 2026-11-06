import type { StopwordResources } from "./text/stopwords.js";

export interface PipelineResources {
  stopwords: StopwordResources;
  /** Terms never used as an area label (whole-term, case-insensitive). */
  labelExclusions: string[];
}

/**
 * Load the bundled resources (about 400 KB of stopwords). Dynamic imports keep
 * them out of the main bundle until a map is built.
 */
export async function loadDefaultResources(): Promise<PipelineResources> {
  const [byLanguage, additional, labelExclusions] = await Promise.all([
    import("../resources/stopwords_iso_cleaned.json").then((m) => m.default as Record<string, string[]>),
    import("../resources/additional_stopwords.json").then((m) => m.default as string[]),
    import("../resources/label_exclusions.json").then((m) => m.default as string[]),
  ]);
  return {
    stopwords: { byLanguage, additional },
    labelExclusions: labelExclusions.map((x) => x.trim().toLowerCase()).filter((x) => x.length > 0),
  };
}
