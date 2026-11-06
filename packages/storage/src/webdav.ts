/**
 * WebDAV (RFC 4918): Nextcloud, ownCloud, Apache mod_dav, nginx dav, rclone
 * serve webdav, … From a browser the server must allow the app's origin
 * (CORS), including the PROPFIND and MKCOL methods and the Authorization and
 * Depth headers.
 */
import { checkKey, checkPrefix, keyUrl, StorageError, type FetchFn, type MapStorage } from "./types.ts";

export interface WebdavOptions {
  /** The folder maps are kept in, e.g. https://cloud.example.org/remote.php/dav/files/me/okmaps/ */
  url: string;
  username?: string;
  password?: string;
  /** Extra headers, e.g. { authorization: "Bearer …" }. */
  headers?: Record<string, string>;
  fetch?: FetchFn;
}

export function webdavStorage(opts: WebdavOptions): MapStorage {
  const base = opts.url.endsWith("/") ? opts.url : `${opts.url}/`;
  const doFetch = opts.fetch ?? ((u, i) => fetch(u, i));
  const auth: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.username !== undefined) {
    auth.authorization = `Basic ${btoa(unescape(encodeURIComponent(`${opts.username}:${opts.password ?? ""}`)))}`;
  }
  const call = async (method: string, url: string, init: RequestInit = {}) =>
    doFetch(url, { ...init, method, headers: { ...auth, ...(init.headers as Record<string, string>) } });
  const fail = (what: string, res: Response) => new StorageError(`WebDAV ${what} failed (${res.status})`, res.status);

  /** Creates the storage folder and the folders above a key, from the top, skipping ones that exist. */
  const makeFolders = async (key: string) => {
    const parts = key.split("/").slice(0, -1);
    const folders = [base, ...parts.map((_, i) => keyUrl(base, parts.slice(0, i + 1).join("/")) + "/")];
    for (const url of folders) {
      const res = await call("MKCOL", url);
      // 201 created; 405 (or 301 on some servers) already there
      if (!res.ok && ![301, 405].includes(res.status)) throw fail("MKCOL", res);
    }
  };

  return {
    label: `WebDAV (${base})`,
    async get(key) {
      const res = await call("GET", keyUrl(base, checkKey(key)));
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw fail("GET", res);
      return res.text();
    },
    async put(key, body, contentType = "application/json") {
      const url = keyUrl(base, checkKey(key));
      const send = () => call("PUT", url, { body, headers: { "content-type": contentType } });
      let res = await send();
      if (res.status === 409 || res.status === 404) {
        await makeFolders(key);
        res = await send();
      }
      if (!res.ok) throw fail("PUT", res);
    },
    async delete(key) {
      const res = await call("DELETE", keyUrl(base, checkKey(key)));
      if (!res.ok && res.status !== 404) throw fail("DELETE", res);
    },
    async list(prefix = "") {
      const folder = prefix ? keyUrl(base, checkPrefix(prefix).slice(0, -1)) + "/" : base;
      const res = await call("PROPFIND", folder, {
        headers: { depth: "1", "content-type": "application/xml; charset=utf-8" },
        body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
      });
      if (res.status === 404) return [];
      if (!res.ok) throw fail("PROPFIND", res);
      return parseMultistatus(await res.text(), folder, prefix);
    },
  };
}

/**
 * The documents (not folders) a PROPFIND Depth 1 answer lists directly
 * inside `folder` (a URL ending in "/"), as `prefix` + name. Namespace
 * prefixes vary by server (d:, D:, none), so elements are matched by local name.
 */
export function parseMultistatus(xml: string, folder: string, prefix: string): string[] {
  // Compared decoded: servers differ in which characters they percent-encode.
  const folderPath = decodeURIComponent(new URL(folder).pathname);
  const keys: string[] = [];
  for (const m of xml.matchAll(/<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/g)) {
    const href = /<(?:[\w-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?href>/.exec(m[1])?.[1]?.trim();
    if (!href) continue;
    if (/<(?:[\w-]+:)?collection\b/.test(m[1])) continue;
    const path = decodeURIComponent(new URL(href.replace(/&amp;/g, "&"), folder).pathname);
    if (!path.startsWith(folderPath)) continue;
    const name = path.slice(folderPath.length);
    if (name && !name.includes("/")) keys.push(prefix + name);
  }
  return keys.sort();
}
