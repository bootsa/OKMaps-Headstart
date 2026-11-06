/**
 * Crossref citation counts: add_citations() in metrics.R, which the PubMed
 * worker (and ORCID) run on every map.
 *
 * metrics.R asks Crossref's OpenURL service (through rcrossref) one DOI at a
 * time. That service does not answer browsers, so this uses Crossref's REST
 * API instead, which allows cross-origin requests and takes many DOIs per
 * request. Both report Crossref's cited-by count for the DOI.
 */
import { fetchText, queryString, type HttpOptions } from "./http.js";

export const CROSSREF_BASE = "https://api.crossref.org";

export interface CrossrefOptions extends HttpOptions {
  /** Contact address sent as mailto, which puts requests in Crossref's polite pool. */
  mailto?: string;
  /** DOIs per request (metrics.R's R_CROSSREF_BATCH_SIZE default is 50). */
  batchSize?: number;
  /** API base URL (default CROSSREF_BASE). */
  endpoint?: string;
}

interface WorksMessage {
  message?: { items?: { DOI?: string; "is-referenced-by-count"?: number }[] } & {
    DOI?: string;
    "is-referenced-by-count"?: number;
  };
}

const key = (doi: string) => doi.trim().toLowerCase();

/**
 * Citation counts by DOI (lowercased and trimmed). DOIs Crossref does not
 * know, and DOIs of a failed request, are missing from the map.
 */
export async function fetchCitationCounts(dois: string[], opts: CrossrefOptions = {}): Promise<Map<string, number>> {
  const base = (opts.endpoint ?? CROSSREF_BASE).replace(/\/$/, "");
  const mailto = opts.mailto ? { mailto: opts.mailto } : {};
  const unique = [...new Set(dois.map(key).filter((d) => d !== ""))];
  const counts = new Map<string, number>();
  const record = (doi: string | undefined, count: number | undefined) => {
    if (typeof doi === "string" && typeof count === "number") counts.set(key(doi), count);
  };

  // The filter syntax separates DOIs with commas, so DOIs containing one are asked for alone.
  const batchable = unique.filter((d) => !d.includes(","));
  const single = unique.filter((d) => d.includes(","));
  const size = Math.max(1, opts.batchSize ?? 50);
  const requests: Promise<void>[] = [];
  for (let i = 0; i < batchable.length; i += size) {
    const batch = batchable.slice(i, i + size);
    const query = queryString({
      filter: batch.map((d) => `doi:${d}`).join(","),
      rows: batch.length,
      select: "DOI,is-referenced-by-count",
      ...mailto,
    });
    requests.push(
      fetchText(`${base}/works?${query}`, {}, opts).then((text) => {
        for (const item of (JSON.parse(text) as WorksMessage).message?.items ?? []) {
          record(item.DOI, item["is-referenced-by-count"]);
        }
      }),
    );
  }
  for (const doi of single) {
    const query = Object.keys(mailto).length ? `?${queryString(mailto)}` : "";
    requests.push(
      fetchText(`${base}/works/${encodeURIComponent(doi)}${query}`, {}, opts).then((text) => {
        const m = (JSON.parse(text) as WorksMessage).message;
        record(m?.DOI, m?.["is-referenced-by-count"]);
      }),
    );
  }
  // metrics.R logs a Crossref failure and leaves the counts empty; failed requests
  // (including unknown DOIs, which get a 404 when asked for alone) are skipped the same way.
  await Promise.allSettled(requests);
  if (opts.signal?.aborted) throw opts.signal.reason;
  return counts;
}

/**
 * Adds citation_count to each paper with a DOI Crossref knows, and null to
 * the rest, keeping the order of the papers.
 */
export async function addCitationCounts<T extends { doi?: string | null }>(
  papers: T[],
  opts: CrossrefOptions = {},
): Promise<(T & { citation_count: number | null })[]> {
  const counts = await fetchCitationCounts(
    papers.map((p) => p.doi ?? ""),
    opts,
  );
  return papers.map((p) => ({ ...p, citation_count: counts.get(key(p.doi ?? "")) ?? null }));
}
