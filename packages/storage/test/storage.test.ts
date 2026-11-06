import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bucketStorage,
  containedDocuments,
  MapLibrary,
  memoryStorage,
  parseMultistatus,
  solidStorage,
  findPod,
  webdavStorage,
  type MapStorage,
} from "../src/index.ts";
import { fileStorage } from "../src/node.ts";
import { fakeBucket, fakeSolid, fakeWebdav } from "./fakes.ts";

const ORIGIN = "https://store.example";

const adaptors: Array<[string, () => MapStorage]> = [
  ["memory", () => memoryStorage()],
  ["files", () => fileStorage(fs.mkdtempSync(path.join(os.tmpdir(), "okmaps-storage-")))],
  ["bucket", () => bucketStorage(fakeBucket(), "okmaps/")],
  ["webdav", () => webdavStorage({ url: `${ORIGIN}/dav/`, username: "me", password: "secret", fetch: fakeWebdav(ORIGIN).fetch })],
  ["solid", () => solidStorage({ container: `${ORIGIN}/pod/okmaps`, fetch: fakeSolid(ORIGIN).fetch })],
];

describe.each(adaptors)("%s storage", (_name, make) => {
  it("stores, lists and removes documents, creating folders as needed", async () => {
    const s = make();
    expect(await s.get("maps/a.json")).toBeNull();
    expect(await s.list("maps/")).toEqual([]);
    await s.put("maps/a.json", '{"a":1}');
    await s.put("maps/b c.json", '{"b":"ü"}');
    await s.put("index.json", "[]");
    expect(await s.get("maps/a.json")).toBe('{"a":1}');
    expect(await s.get("maps/b c.json")).toBe('{"b":"ü"}');
    expect(await s.list("maps/")).toEqual(["maps/a.json", "maps/b c.json"]);
    expect(await s.list()).toEqual(["index.json"]);
    await s.put("maps/a.json", '{"a":2}');
    expect(await s.get("maps/a.json")).toBe('{"a":2}');
    await s.delete("maps/a.json");
    await s.delete("maps/a.json");
    expect(await s.get("maps/a.json")).toBeNull();
    expect(await s.list("maps/")).toEqual(["maps/b c.json"]);
  });

  it("refuses keys that leave its folder", async () => {
    const s = make();
    for (const key of ["../x.json", "/x.json", "maps//x.json", "maps/./x.json"]) {
      await expect(s.get(key)).rejects.toThrow(/invalid key/);
    }
  });

  it("holds a map library", async () => {
    const lib = new MapLibrary(make());
    const map = (id: string, created: string) => ({ id, title: `map ${id}`, created, context: { service: "pubmed" }, documents: [] });
    // Saved out of order (as when copying maps from another storage): listed newest first.
    await lib.save(map("two", "2026-11-02T10:00:00Z"));
    await lib.save(map("one", "2026-11-01T10:00:00Z"));
    expect((await lib.list()).map((m) => m.id)).toEqual(["two", "one"]);
    expect(await lib.get("one")).toMatchObject({ title: "map one" });
    await lib.delete("one");
    expect((await lib.list()).map((m) => m.id)).toEqual(["two"]);
    expect(await lib.get("one")).toBeUndefined();
  });
});

describe("MapLibrary", () => {
  it("rebuilds the index when another device changed the maps", async () => {
    const storage = memoryStorage();
    const lib = new MapLibrary(storage);
    await lib.save({ id: "one", title: "One", created: "2026-11-01T10:00:00Z", context: { service: "base" }, documents: [{}, {}] });
    // Another device adds a map without updating the index.
    await storage.put("maps/two.json", JSON.stringify({ id: "two", title: "Two", created: "2026-11-03T10:00:00Z", context: { service: "pubmed" } }));
    expect(await lib.list()).toEqual([
      { id: "two", title: "Two", created: "2026-11-03T10:00:00Z", service: "pubmed", documents: 0 },
      { id: "one", title: "One", created: "2026-11-01T10:00:00Z", service: "base", documents: 2 },
    ]);
    expect(JSON.parse((await storage.get("index.json"))!)).toHaveLength(2);
  });

  it("refuses ids that are not plain names", async () => {
    await expect(new MapLibrary(memoryStorage()).get("../index")).rejects.toThrow(/invalid map id/);
  });
});

describe("WebDAV", () => {
  it("sends the credentials and creates missing folders once", async () => {
    const dav = fakeWebdav(ORIGIN);
    const s = webdavStorage({ url: `${ORIGIN}/dav`, username: "me", password: "secret", fetch: dav.fetch });
    await s.put("maps/a.json", "{}");
    await s.put("maps/b.json", "{}");
    expect(dav.calls).toEqual(["PUT /dav/maps/a.json", "MKCOL /dav/", "MKCOL /dav/maps/", "PUT /dav/maps/a.json", "PUT /dav/maps/b.json"]);
  });

  it("creates the storage folder itself when it is missing", async () => {
    const dav = fakeWebdav(ORIGIN);
    const s = webdavStorage({ url: `${ORIGIN}/dav/okmaps/`, username: "me", password: "secret", fetch: dav.fetch });
    await s.put("okmaps.txt", "hello", "text/plain");
    expect(await s.get("okmaps.txt")).toBe("hello");
    expect(dav.tree.get("/dav/okmaps/")).toBeNull();
  });

  it("reports a refused login", async () => {
    const s = webdavStorage({ url: `${ORIGIN}/dav/`, username: "me", password: "wrong", fetch: fakeWebdav(ORIGIN).fetch });
    await expect(s.get("index.json")).rejects.toMatchObject({ status: 401 });
  });

  it("reads multistatus answers from different servers", () => {
    // Apache mod_dav: "D:" prefix, absolute hrefs, lp1 namespace.
    const apache = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:ns0="DAV:">
<D:response xmlns:lp1="DAV:"><D:href>/okmaps/maps/</D:href><D:propstat><D:prop><lp1:resourcetype><D:collection/></lp1:resourcetype></D:prop></D:propstat></D:response>
<D:response xmlns:lp1="DAV:"><D:href>/okmaps/maps/a%20b.json</D:href><D:propstat><D:prop><lp1:resourcetype/></D:prop></D:propstat></D:response>
<D:response xmlns:lp1="DAV:"><D:href>/okmaps/maps/sub/</D:href><D:propstat><D:prop><lp1:resourcetype><D:collection/></lp1:resourcetype></D:prop></D:propstat></D:response>
</D:multistatus>`;
    expect(parseMultistatus(apache, "https://h.example/okmaps/maps/", "maps/")).toEqual(["maps/a b.json"]);
    // No prefix, full URLs, encoded differently from the request.
    const plain = `<multistatus xmlns="DAV:"><response><href>https://h.example/my%20files/x.json</href><propstat><prop><resourcetype/></prop></propstat></response></multistatus>`;
    expect(parseMultistatus(plain, "https://h.example/my files/", "")).toEqual(["x.json"]);
  });
});

describe("Solid", () => {
  it("reads ldp:contains in the forms servers write", () => {
    const css = `@prefix ldp: <http://www.w3.org/ns/ldp#>.\n<> a ldp:BasicContainer;\n    ldp:contains <a.json>, <sub/>, <b%20c.json>.`;
    expect(containedDocuments(css, "https://pod.example/okmaps/maps/")).toEqual(["a.json", "b c.json"]);
    const full = `<https://pod.example/okmaps/> <http://www.w3.org/ns/ldp#contains> <https://pod.example/okmaps/index.json> .`;
    expect(containedDocuments(full, "https://pod.example/okmaps/")).toEqual(["index.json"]);
    const otherPrefix = `@prefix l: <http://www.w3.org/ns/ldp#>.\n<> l:contains <x.json>.`;
    expect(containedDocuments(otherPrefix, "https://pod.example/c/")).toEqual(["x.json"]);
  });

  it("finds the Pod from the WebID profile", async () => {
    const profile = `@prefix pim: <http://www.w3.org/ns/pim/space#>.\n<#me> pim:storage </alice/>.`;
    const fetch = async (u: string) => (u === "https://pod.example/alice/profile/card#me" ? new Response(profile) : new Response(null, { status: 404 }));
    expect(await findPod("https://pod.example/alice/profile/card#me", fetch)).toBe("https://pod.example/alice/");
  });

  it("falls back to the container that says it is a storage", async () => {
    const seen: string[] = [];
    const fetch = async (u: string, init?: RequestInit) => {
      seen.push(`${init?.method ?? "GET"} ${u}`);
      if (u.endsWith("#me")) return new Response("<#me> a <http://xmlns.com/foaf/0.1/Person>.");
      const link = u === "https://id.example/bob/" ? '<http://www.w3.org/ns/pim/space#Storage>; rel="type"' : '<http://www.w3.org/ns/ldp#Container>; rel="type"';
      return new Response(null, { headers: { link } });
    };
    expect(await findPod("https://id.example/bob/profile/card#me", fetch)).toBe("https://id.example/bob/");
    expect(seen).toEqual(["GET https://id.example/bob/profile/card#me", "HEAD https://id.example/bob/profile/", "HEAD https://id.example/bob/"]);
    const none = async () => new Response(null, { status: 404 });
    expect(await findPod("https://id.example/x/card#me", none)).toBeNull();
  });
});
