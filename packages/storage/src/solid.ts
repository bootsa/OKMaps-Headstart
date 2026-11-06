/**
 * Solid Pods (Linked Data Platform containers): Community Solid Server,
 * Inrupt ESS, NSS, … Writing needs a logged-in session: pass the
 * authenticated fetch of a Solid-OIDC client (for example
 * @inrupt/solid-client-authn-browser's session.fetch) as `fetch`.
 */
import { checkKey, checkPrefix, keyUrl, StorageError, type FetchFn, type MapStorage } from "./types.ts";

export interface SolidOptions {
  /** The container maps are kept in, e.g. https://alice.solidcommunity.net/okmaps/ */
  container: string;
  fetch?: FetchFn;
}

const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";

export function solidStorage(opts: SolidOptions): MapStorage {
  const base = opts.container.endsWith("/") ? opts.container : `${opts.container}/`;
  const doFetch = opts.fetch ?? ((u, i) => fetch(u, i));
  const fail = (what: string, res: Response) => new StorageError(`Solid ${what} failed (${res.status})`, res.status);
  return {
    label: `Solid Pod (${base})`,
    async get(key) {
      const res = await doFetch(keyUrl(base, checkKey(key)), { headers: { accept: "application/json, */*;q=0.1" } });
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw fail("GET", res);
      return res.text();
    },
    async put(key, body, contentType = "application/json") {
      // Solid servers create the containers above a resource on PUT.
      const res = await doFetch(keyUrl(base, checkKey(key)), { method: "PUT", body, headers: { "content-type": contentType } });
      if (!res.ok) throw fail("PUT", res);
    },
    async delete(key) {
      const res = await doFetch(keyUrl(base, checkKey(key)), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw fail("DELETE", res);
    },
    async list(prefix = "") {
      const folder = prefix ? keyUrl(base, checkPrefix(prefix).slice(0, -1)) + "/" : base;
      const res = await doFetch(folder, { headers: { accept: "text/turtle" } });
      if (res.status === 404) return [];
      if (!res.ok) throw fail("GET", res);
      return containedDocuments(await res.text(), folder).map((name) => prefix + name);
    },
  };
}

/**
 * Names of the documents (not containers) an LDP container lists with
 * ldp:contains, from its Turtle. Handles the forms servers write:
 * `ldp:contains <a>, <b>;` with any prefix bound to the LDP namespace, or
 * the full IRI.
 */
export function containedDocuments(turtle: string, container: string): string[] {
  const prefixes = [...turtle.matchAll(/@prefix\s+([\w-]*):\s*<([^>]*)>/gi)]
    .filter((m) => m[2] === "http://www.w3.org/ns/ldp#")
    .map((m) => `${m[1]}:contains`);
  const predicates = [`<${LDP_CONTAINS}>`, ...prefixes].map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?:${predicates.join("|")})\\s+((?:<[^>]*>\\s*,?\\s*)+)`, "g");
  const names = new Set<string>();
  const containerUrl = new URL(container);
  for (const m of turtle.matchAll(re)) {
    for (const iri of m[1].matchAll(/<([^>]*)>/g)) {
      const url = new URL(iri[1], container);
      if (url.origin !== containerUrl.origin || !url.pathname.startsWith(containerUrl.pathname)) continue;
      const name = decodeURIComponent(url.pathname.slice(containerUrl.pathname.length));
      if (name && !name.includes("/")) names.add(name);
    }
  }
  return [...names].sort();
}
