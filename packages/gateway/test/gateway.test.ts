import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGateway, type GatewayConfig } from "../src/gateway.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoriesXml = fs.readFileSync(path.join(here, "repositories.xml"), "utf8");
const KEY = "secret-key";

/**
 * A gateway with a fake upstream and a fake clock that only moves with
 * advance(); `waits` records how long each request was told to wait.
 */
function setup(config: Partial<GatewayConfig> = {}, upstream?: (url: URL) => Response | Promise<Response>) {
  let t = 1_000_000;
  const calls: { url: URL }[] = [];
  const waits: number[] = [];
  const handler = createGateway({
    baseApiKey: KEY,
    allowedOrigins: ["https://maps.example.org"],
    now: () => t,
    sleep: async (ms) => {
      waits.push(ms);
    },
    fetch: async (u) => {
      const url = new URL(u);
      calls.push({ url });
      if (upstream) return upstream(url);
      const func = url.searchParams.get("func");
      if (func === "ListRepositories") return new Response(repositoriesXml, { headers: { "content-type": "text/xml" } });
      return new Response(`<response><result numFound="0"/></response>`, { headers: { "content-type": "text/xml" } });
    },
    ...config,
  });
  const get = (p: string, headers: Record<string, string> = {}, address = "1.2.3.4") =>
    handler(new Request(`https://gw.example${p}`, { headers }), { address });
  return { handler, get, calls, waits, advance: (ms: number) => (t += ms) };
}

describe("BASE search", () => {
  it("forwards the search with the API key and returns BASE's answer", async () => {
    const { get, calls } = setup();
    const res = await get("/base/search?func=Other&apikey=mine&query=climate&hits=120&offset=0&filter=descsize%3A%5B300+TO+*%5D", {
      origin: "https://maps.example.org",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("numFound");
    expect(res.headers.get("access-control-allow-origin")).toBe("https://maps.example.org");
    expect(res.headers.get("vary")).toBe("Origin");
    const sent = calls[0].url;
    expect(sent.origin + sent.pathname).toBe("https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi");
    expect(Object.fromEntries(sent.searchParams)).toEqual({
      func: "PerformSearch",
      query: "climate",
      hits: "120",
      offset: "0",
      filter: "descsize:[300 TO *]",
      apikey: KEY,
    });
  });

  it("rejects requests BASE should not get", async () => {
    const { get, calls } = setup();
    expect((await get("/base/search?hits=10")).status).toBe(400);
    expect((await get("/base/search?query=x&hits=500")).status).toBe(400);
    expect((await get("/base/search?query=x&offset=-1")).status).toBe(400);
    expect(await (await get("/base/search?query=x&func2=y")).json()).toEqual({ error: "unsupported parameter: func2" });
    expect(calls).toHaveLength(0);
  });

  it("spaces BASE requests one second apart across clients", async () => {
    const { get, calls, waits } = setup();
    await Promise.all([get("/base/search?query=a", {}, "1.1.1.1"), get("/base/search?query=b", {}, "2.2.2.2"), get("/base/repositories")]);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("answers 503 when the queue is too long", async () => {
    const { get } = setup({ maxQueueMs: 2500 });
    const res = await Promise.all([1, 2, 3, 4].map((i) => get(`/base/search?query=${i}`)));
    expect(res.map((r) => r.status)).toEqual([200, 200, 200, 503]);
    expect(res[3].headers.get("retry-after")).toBe("3");
  });

  it("passes BASE errors through and reports unreachable upstreams as 502", async () => {
    let fail = false;
    const { get } = setup({}, () => {
      if (fail) throw new TypeError("fetch failed");
      return new Response("forbidden", { status: 403 });
    });
    expect((await get("/base/search?query=x")).status).toBe(403);
    fail = true;
    const res = await get("/base/search?query=x");
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain(KEY);
  });
});

describe("BASE repositories", () => {
  it("are cached for a day and shared by concurrent requests", async () => {
    const { get, calls, advance } = setup();
    const [a, b] = await Promise.all([get("/base/repositories"), get("/base/repositories")]);
    expect(await a.text()).toBe(repositoriesXml);
    expect(await b.text()).toBe(repositoriesXml);
    expect(a.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ func: "ListRepositories", coll: "", apikey: KEY });
    advance(23 * 3600_000);
    await get("/base/repositories");
    expect(calls).toHaveLength(1);
    advance(2 * 3600_000);
    await get("/base/repositories");
    expect(calls).toHaveLength(2);
  });

  it("serve the last good list when BASE fails", async () => {
    let up = true;
    const { get, advance } = setup({}, () => (up ? new Response(repositoriesXml) : new Response("down", { status: 500 })));
    await get("/base/repositories");
    up = false;
    advance(25 * 3600_000);
    const res = await get("/base/repositories");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(repositoriesXml);
  });
});

describe("OpenAIRE", () => {
  it("passes searches through unchanged", async () => {
    const { get, calls } = setup({}, () => new Response("<response/>"));
    const res = await get("/openaire/search/publications?projectID=643410&funder=EC&size=1000&format=xml");
    expect(res.status).toBe(200);
    expect(calls[0].url.href).toBe("https://api.openaire.eu/search/publications?projectID=643410&funder=EC&size=1000&format=xml");
    expect((await get("/openaire/search/organizations")).status).toBe(404);
  });

  it("can be turned off", async () => {
    const { get } = setup({ openaireUrl: null });
    expect((await get("/openaire/search/projects?grantID=1")).status).toBe(404);
  });
});

describe("access", () => {
  it("refuses other origins and answers preflights", async () => {
    const { handler, get } = setup();
    expect((await get("/base/search?query=x", { origin: "https://evil.example" })).status).toBe(403);
    const pre = await handler(
      new Request("https://gw.example/base/search", { method: "OPTIONS", headers: { origin: "https://maps.example.org" } }),
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://maps.example.org");
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(pre.headers.get("access-control-allow-headers")).toBe("content-type");
    expect((await handler(new Request("https://gw.example/base/search", { method: "POST" }))).status).toBe(405);
    expect((await handler(new Request("https://gw.example/base/search", { method: "DELETE" }))).status).toBe(405);
  });

  it("allows any origin with *", async () => {
    const { get } = setup({ allowedOrigins: ["*"] });
    const res = await get("/health", { origin: "https://anywhere.example" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("limits requests per client", async () => {
    const { get, advance } = setup({ clientLimit: { requests: 2, windowMs: 60_000 }, baseIntervalMs: 0 });
    expect((await get("/base/search?query=a")).status).toBe(200);
    expect((await get("/base/search?query=b")).status).toBe(200);
    const res = await get("/base/search?query=c");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect((await get("/base/search?query=c", {}, "5.6.7.8")).status).toBe(200);
    advance(60_000);
    expect((await get("/base/search?query=c")).status).toBe(200);
  });
});
