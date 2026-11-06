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

const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";

/**
 * The IRIs a Turtle document gives as objects of `predicate` (a full IRI),
 * resolved against `base`. Handles the forms Solid servers write: the
 * predicate as a full IRI or with any prefix bound to its namespace, and
 * several objects separated by commas. Not a full Turtle parser.
 */
export function turtleObjects(turtle: string, base: string, predicate: string): string[] {
  const cut = Math.max(predicate.lastIndexOf("#"), predicate.lastIndexOf("/")) + 1;
  const [ns, local] = [predicate.slice(0, cut), predicate.slice(cut)];
  const prefixes = [...turtle.matchAll(/@prefix\s+([\w-]*):\s*<([^>]*)>/gi)].filter((m) => m[2] === ns).map((m) => `${m[1]}:${local}`);
  const forms = [`<${predicate}>`, ...prefixes].map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?:${forms.join("|")})\\s+((?:<[^>]*>\\s*,?\\s*)+)`, "g");
  const out: string[] = [];
  for (const m of turtle.matchAll(re)) for (const iri of m[1].matchAll(/<([^>]*)>/g)) out.push(new URL(iri[1], base).href);
  return out;
}

/**
 * Names of the documents (not containers) an LDP container lists with
 * ldp:contains, from its Turtle.
 */
export function containedDocuments(turtle: string, container: string): string[] {
  const containerUrl = new URL(container);
  const names = new Set<string>();
  for (const iri of turtleObjects(turtle, container, LDP_CONTAINS)) {
    const url = new URL(iri);
    if (url.origin !== containerUrl.origin || !url.pathname.startsWith(containerUrl.pathname)) continue;
    const name = decodeURIComponent(url.pathname.slice(containerUrl.pathname.length));
    if (name && !name.includes("/")) names.add(name);
  }
  return [...names].sort();
}

/**
 * The root of the Pod a WebID belongs to: the pim:storage its profile names,
 * or else the nearest container above the WebID that says it is a storage
 * (Link: <…pim/space#Storage>; rel="type"), as Solid's protocol describes.
 */
export async function findPod(webId: string, doFetch: FetchFn = (u, i) => fetch(u, i)): Promise<string | null> {
  const res = await doFetch(webId, { headers: { accept: "text/turtle" } });
  if (res.ok) {
    const [pod] = turtleObjects(await res.text(), res.url || webId, PIM_STORAGE);
    if (pod) return pod.endsWith("/") ? pod : `${pod}/`;
  }
  let url = new URL(".", webId);
  for (;;) {
    const head = await doFetch(url.href, { method: "HEAD" });
    if (/<http:\/\/www\.w3\.org\/ns\/pim\/space#Storage>\s*;\s*rel="?type"?/i.test(head.headers.get("link") ?? "")) return url.href;
    if (url.pathname === "/") return null;
    url = new URL("..", url);
  }
}
