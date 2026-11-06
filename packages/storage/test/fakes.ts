/**
 * In-memory stand-ins for a WebDAV server, a Solid server and an R2 bucket,
 * behaving as the real ones do in the ways the adaptors depend on
 * (409 for a missing parent folder, containers created on PUT, …).
 */
import type { FetchFn, ObjectBucket } from "../src/index.ts";

type Tree = Map<string, string | null>; // path -> body, or null for a folder

const parent = (p: string) => p.replace(/[^/]+\/?$/, "");

export function fakeWebdav(origin: string, root = "/dav/"): { fetch: FetchFn; tree: Tree; calls: string[] } {
  const tree: Tree = new Map([[root, null]]);
  const calls: string[] = [];
  const fetch: FetchFn = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const p = decodeURIComponent(url.pathname);
    calls.push(`${method} ${p}`);
    const headers = new Headers(init.headers);
    if (headers.get("authorization") !== `Basic ${btoa("me:secret")}`) return new Response(null, { status: 401 });
    switch (method) {
      case "GET": {
        const body = tree.get(p);
        return typeof body === "string" ? new Response(body) : new Response(null, { status: 404 });
      }
      case "PUT":
        if (tree.get(parent(p)) !== null) return new Response(null, { status: 409 });
        tree.set(p, String(init.body));
        return new Response(null, { status: 201 });
      case "MKCOL":
        if (tree.has(p)) return new Response(null, { status: 405 });
        if (tree.get(parent(p)) !== null) return new Response(null, { status: 409 });
        tree.set(p, null);
        return new Response(null, { status: 201 });
      case "DELETE":
        if (!tree.has(p)) return new Response(null, { status: 404 });
        tree.delete(p);
        return new Response(null, { status: 204 });
      case "PROPFIND": {
        if (tree.get(p) !== null) return new Response(null, { status: 404 });
        const kids = [...tree.keys()].filter((k) => k !== p && parent(k) === p);
        // Like Nextcloud: "d:" prefix, hrefs percent-encoded, the folder itself listed first.
        const entry = (k: string) =>
          `<d:response><d:href>${encodeURI(k)}</d:href><d:propstat><d:prop><d:resourcetype>${tree.get(k) === null ? "<d:collection/>" : ""}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
        return new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${[p, ...kids].map(entry).join("")}</d:multistatus>`, { status: 207 });
      }
    }
    return new Response(null, { status: 405 });
  };
  return { fetch, tree, calls };
}

export function fakeSolid(origin: string, root = "/pod/"): { fetch: FetchFn; tree: Tree } {
  const tree: Tree = new Map([[root, null]]);
  const fetch: FetchFn = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const p = decodeURIComponent(url.pathname);
    if (!p.startsWith(root)) return new Response(null, { status: 403 });
    switch (method) {
      case "GET": {
        const body = tree.get(p);
        if (body === undefined) return new Response(null, { status: 404 });
        if (body !== null) return new Response(body);
        // Community Solid Server style Turtle, relative IRIs.
        const kids = [...tree.keys()].filter((k) => k !== p && parent(k) === p).map((k) => `<${encodeURI(k.slice(p.length))}>`);
        const turtle = `@prefix dc: <http://purl.org/dc/terms/>.\n@prefix ldp: <http://www.w3.org/ns/ldp#>.\n\n<> a ldp:Container, ldp:BasicContainer, ldp:Resource${kids.length ? `;\n    ldp:contains ${kids.join(", ")}` : ""}.\n`;
        return new Response(turtle, { headers: { "content-type": "text/turtle" } });
      }
      case "PUT": {
        // Solid creates the containers above a resource.
        for (let q = parent(p); q.length >= root.length && !tree.has(q); q = parent(q)) tree.set(q, null);
        tree.set(p, String(init.body));
        return new Response(null, { status: 201 });
      }
      case "DELETE":
        if (!tree.has(p)) return new Response(null, { status: 404 });
        tree.delete(p);
        return new Response(null, { status: 205 });
    }
    return new Response(null, { status: 405 });
  };
  return { fetch, tree };
}

export function fakeBucket(): ObjectBucket {
  const objects = new Map<string, string>();
  return {
    get: async (k) => (objects.has(k) ? { text: async () => objects.get(k)! } : null),
    put: async (k, v) => void objects.set(k, v),
    delete: async (k) => void objects.delete(k),
    // Two keys per page, to exercise the cursor.
    list: async ({ prefix = "", cursor } = {}) => {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + 2);
      const truncated = start + 2 < keys.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + 2) : undefined };
    },
  };
}
