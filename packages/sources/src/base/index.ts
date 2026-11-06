/**
 * BASE adaptor: the whole of a BASE search as get_papers() in base.R and
 * BaseClient.execute_search in the Python worker run it.
 *
 * BASE only answers registered IP addresses, so requests go to a gateway
 * that forwards them to BASE's PerformSearch interface with the API key and
 * returns BASE's XML unchanged.
 */
import { NetworkError, SourceError, toSourceError } from "../errors.js";
import { fetchText, type HttpOptions } from "../http.js";
import type { SourceResult } from "../types.js";
import { filterDuplicates } from "./dedup.js";
import { finalizeBaseRecords, type BasePaper } from "./finalize.js";
import { FIELD_MAPPER, baseRequestParams, buildBaseRequest, type BaseParams } from "./query.js";
import { etl, markDuplicates, parseBaseXml, sanitizeAbstract, type BaseDoc, type BaseRecord } from "./records.js";

export { buildBaseRequest, baseRequestParams, preprocessQuery } from "./query.js";
export type { BaseParams, BaseRequest } from "./query.js";
export { cleanSubject } from "./subjects.js";
export type { BasePaper } from "./finalize.js";

export interface BaseOptions extends HttpOptions {
  /** Gateway URL that forwards the query string to BASE's PerformSearch and returns its XML. */
  endpoint: string;
  /** BASE content provider names to internal names, for journal field parsing. */
  contentProviders?: Map<string, string>;
  /** Pause between BASE requests in ms (rbace waits 1 s). */
  minIntervalMs?: number;
}

/** BASE returns at most this many records per page; base.R pages in steps of 120. */
const PAGE = 120;
/** base.R makes at most this many extra page requests to replace duplicates. */
const MAX_EXTRA_PAGES = 9;

type Marked = BaseRecord & { is_duplicate: boolean; duplicates: string; has_dataset: boolean };

function prepare(docs: BaseDoc[], params: BaseParams, dedupeRows: boolean): Marked[] {
  let records = etl(docs, { visType: params.vis_type, repo: params.repo, nonPublic: params.repo === "fttriple" });
  if (dedupeRows) {
    // unique(metadata): drops records identical in every field (the same document on two pages).
    const seen = new Set<string>();
    records = records.filter((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  records = records.map((r) => ({ ...r, paper_abstract: sanitizeAbstract(r.paper_abstract) }));
  let marked: Marked[] = markDuplicates(records).map((r) => ({ ...r, has_dataset: r.resulttype.includes("Dataset") }));
  const cc = params.custom_clustering;
  if (cc != null && !Object.hasOwn(FIELD_MAPPER, cc)) marked = marked.filter((r) => r.subject_orig.includes(`${cc}:`));
  return marked;
}

/** Runs a BASE search through the gateway and returns records ready for the map pipeline. */
export async function searchBase(params: BaseParams, opts: BaseOptions): Promise<SourceResult & { papers: BasePaper[] }> {
  const limit = params.limit ?? PAGE;
  const minInterval = opts.minIntervalMs ?? 1000;
  let last = 0;
  const page = async (offset: number) => {
    const wait = last + minInterval - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const req = buildBaseRequest(params, offset);
    try {
      const sep = opts.endpoint.includes("?") ? "&" : "?";
      return { req, res: parseBaseXml(await fetchText(`${opts.endpoint}${sep}${baseRequestParams(req)}`, {}, opts)) };
    } catch (err) {
      // base.R reports every failed BASE request as a timeout.
      if (err instanceof NetworkError || (err instanceof Error && err.name === "HttpError")) {
        throw new Error("Timeout was reached: [api.base-search.net]");
      }
      throw err;
    } finally {
      last = Date.now();
    }
  };

  try {
    let offset = 0;
    const first = await page(offset);
    let docs = first.res.docs;
    let numFound = first.res.numFound;
    if (docs.length === 0) throw new Error("No results retrieved.");
    let records = prepare(docs, params, false);
    for (let r = 0; r < MAX_EXTRA_PAGES; r++) {
      const unique = records.length - records.filter((x) => x.is_duplicate).length;
      if (!(unique < limit && numFound > offset + PAGE)) break;
      offset += PAGE;
      const next = await page(offset);
      docs = [...docs, ...next.res.docs];
      numFound = next.res.numFound;
      records = prepare(docs, params, true);
    }
    const { papers, content } = finalizeBaseRecords(filterDuplicates(records), {
      listSize: params.list_size ?? 100,
      contentProviders: opts.contentProviders,
      customClustering: params.custom_clustering,
    });
    return { service: "base", query: first.req.query, papers, content };
  } catch (err) {
    if (err instanceof SourceError) throw err;
    throw toSourceError("base", err, params);
  }
}
export { parseBaseRepositories, fetchBaseContentProviders } from "./repositories.js";
