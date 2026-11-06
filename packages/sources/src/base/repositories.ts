/**
 * BASE content providers (bs_repositories in rbace, as
 * run_base_contentproviders.R calls it): provider display names to BASE's
 * internal names, which decide how the journal fields of a record are parsed.
 */
import { fetchText, type HttpOptions } from "../http.js";
import { findAll, parseXml, textOf } from "../xml.js";

/** rbace parse_coll plus the GoTriple entry run_base_contentproviders.R appends. */
export function parseBaseRepositories(xml: string): Map<string, string> {
  const root = parseXml(xml);
  const names = findAll(root, ".//repository/name").map(textOf);
  const internal = findAll(root, ".//repository/internal_name").map(textOf);
  const out = new Map<string, string>();
  // pandas set_index + to_dict in the worker: a later duplicate name wins.
  names.forEach((name, i) => out.set(name, internal[i] ?? ""));
  out.set("GoTriple", "fttriple");
  return out;
}

/** Loads the content provider list from the gateway's /base/repositories route. */
export async function fetchBaseContentProviders(url: string, opts: HttpOptions = {}): Promise<Map<string, string>> {
  return parseBaseRepositories(await fetchText(url, {}, opts));
}
