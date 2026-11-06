/**
 * The gateway on a real Node server, used by the BASE adaptor of
 * @okmaps/sources the way the browser app will use it.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createGateway } from "../src/gateway.ts";
import { serve } from "../src/node.ts";
import { fetchBaseContentProviders, searchBase } from "../../sources/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoriesXml = fs.readFileSync(path.join(here, "repositories.xml"), "utf8");
const baseXml = zlib
  .gunzipSync(fs.readFileSync(path.join(here, "../../sources/test/fixtures/base/base_digital_education.xml.gz")))
  .toString("utf8");

const upstreamCalls: URL[] = [];
const addresses: (string | undefined)[] = [];
let server: ReturnType<typeof serve>;
let gw = "";

beforeAll(async () => {
  const handler = createGateway({
    baseApiKey: "k",
    allowedOrigins: ["https://maps.example.org"],
    baseIntervalMs: 0,
    fetch: async (u) => {
      const url = new URL(u);
      upstreamCalls.push(url);
      return new Response(url.searchParams.get("func") === "ListRepositories" ? repositoriesXml : baseXml, {
        headers: { "content-type": "text/xml; charset=UTF-8" },
      });
    },
  });
  server = serve(
    async (req, client) => {
      addresses.push(client?.address);
      return handler(req, client);
    },
    { port: 0, host: "127.0.0.1" },
  );
  await new Promise((r) => server.once("listening", r));
  gw = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

it("serves the BASE adaptor end to end", async () => {
  const providers = await fetchBaseContentProviders(`${gw}/base/repositories`);
  expect(providers.get("Zenodo")).toBe("ftzenodo");
  expect(providers.get("GoTriple")).toBe("fttriple");

  const res = await searchBase(
    { q: "digital education", from: "1665-01-01", to: "2024-01-01", document_types: ["121"], limit: 100, list_size: 100 },
    { endpoint: `${gw}/base/search`, contentProviders: providers, minIntervalMs: 0 },
  );
  expect(res.papers.length).toBeGreaterThan(50);
  const search = upstreamCalls.find((u) => u.searchParams.get("func") === "PerformSearch")!;
  expect(search.searchParams.get("apikey")).toBe("k");
  expect(search.searchParams.get("query")).toContain("education");
  expect(addresses[0]).toBe("127.0.0.1");
});

it("sends CORS headers and errors over HTTP", async () => {
  const ok = await fetch(`${gw}/health`, { headers: { origin: "https://maps.example.org" } });
  expect(ok.headers.get("access-control-allow-origin")).toBe("https://maps.example.org");
  const bad = await fetch(`${gw}/base/search?query=x&nope=1`);
  expect(bad.status).toBe(400);
  expect(await bad.json()).toEqual({ error: "unsupported parameter: nope" });
});
