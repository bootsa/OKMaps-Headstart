/**
 * The OKMaps source gateway: a stateless HTTP handler that lets the browser
 * app reach providers it cannot call directly.
 *
 *   GET /base/search?...                 BASE PerformSearch, with the API key
 *                                        added, from the gateway's registered IP
 *   GET /base/repositories               BASE ListRepositories (content provider
 *                                        names), cached for a day
 *   GET /openaire/search/{projects|publications|datasets}?...
 *                                        OpenAIRE search API, for browsers it
 *                                        refuses (optional)
 *   POST /maps                           publish a map (share link); answers its id
 *   GET /maps/{id}                       a published map
 *   GET /health
 *
 * Responses are the provider's own bodies, unchanged. The handler takes a
 * Fetch API Request and returns a Response, so it runs on Node (src/node.ts)
 * or any runtime with fetch (Deno, Bun, Cloudflare Workers).
 */
import { ClientLimiter, Spacer, realSleep, type Clock, type Sleep } from "./limits.ts";
import { MAP_ID, mapId, validateMap, type MapStore } from "./maps.ts";

export const BASE_API = "https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi";
export const OPENAIRE_API = "https://api.openaire.eu/";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface GatewayConfig {
  /** BASE API key (R_BASE_APIKEY in the R services). */
  baseApiKey: string;
  /** Origins allowed to call the gateway from a browser; "*" allows any. */
  allowedOrigins: string[];
  /** BASE endpoint (default BASE_API). */
  baseUrl?: string;
  /** OpenAIRE API base, or null to turn the OpenAIRE route off (default OPENAIRE_API). */
  openaireUrl?: string | null;
  /** Minimum time between BASE requests (default 1000 ms, BASE's published limit). */
  baseIntervalMs?: number;
  /** Longest a request may queue for its BASE slot before getting 503 (default 30 s). */
  maxQueueMs?: number;
  /** Requests per client per window, over all routes (default 60 per 5 minutes). */
  clientLimit?: { requests: number; windowMs: number };
  /** How long the repository list is cached (default 24 h). */
  repositoriesTtlMs?: number;
  /** Upstream timeout (default 60 s). */
  upstreamTimeoutMs?: number;
  /** Published maps (share links); the /maps routes are off without it. */
  maps?: {
    store: MapStore;
    /** Largest map accepted, in bytes (default 3 MB). */
    maxBytes?: number;
    /** Maps a client may publish per window (default 30 per hour). */
    publishLimit?: { requests: number; windowMs: number };
  };
  fetch?: FetchFn;
  now?: Clock;
  sleep?: Sleep;
}

/** What the server adapter knows about the caller. */
export interface ClientInfo {
  /** Address used for the per-client limit. */
  address?: string;
}

export type Handler = (req: Request, client?: ClientInfo) => Promise<Response>;

/** PerformSearch parameters passed on to BASE (rbace's bs_search set). */
const BASE_SEARCH_PARAMS = new Set([
  "query", "coll", "target", "boost", "fields", "hits", "offset", "sortby",
  "facets", "facet_limit", "facet_sort", "filter", "triple",
]);
/** BASE returns at most 125 records per request. */
const MAX_HITS = 125;
const OPENAIRE_PATHS = new Set(["projects", "publications", "datasets"]);

export function createGateway(config: GatewayConfig): Handler {
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? realSleep;
  const doFetch = config.fetch ?? ((url, init) => fetch(url, init));
  const baseUrl = config.baseUrl ?? BASE_API;
  const openaireUrl = config.openaireUrl === undefined ? OPENAIRE_API : config.openaireUrl;
  const spacer = new Spacer(config.baseIntervalMs ?? 1000, config.maxQueueMs ?? 30_000, now, sleep);
  const limit = config.clientLimit ?? { requests: 60, windowMs: 5 * 60_000 };
  const clients = new ClientLimiter(limit.requests, limit.windowMs, now);
  const ttl = config.repositoriesTtlMs ?? 24 * 3600_000;
  const timeoutMs = config.upstreamTimeoutMs ?? 60_000;
  const anyOrigin = config.allowedOrigins.includes("*");
  const origins = new Set(config.allowedOrigins);

  const maxMapBytes = config.maps?.maxBytes ?? 3_000_000;
  const publishLimit = config.maps?.publishLimit ?? { requests: 30, windowMs: 3600_000 };
  const publishers = new ClientLimiter(publishLimit.requests, publishLimit.windowMs, now);

  let repositories: { body: string; type: string; at: number } | null = null;
  let repositoriesLoading: Promise<Response> | null = null;

  const upstream = async (url: string): Promise<Response> => {
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "text/xml; charset=UTF-8" },
      });
    } catch (err) {
      return error(502, `upstream not reachable: ${err instanceof Error ? err.name : "error"}`);
    }
  };

  const baseQuery = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    sp.set("apikey", config.baseApiKey);
    return `${baseUrl}?${sp}`;
  };

  /** Waits for a BASE slot, or answers 503 when the queue is too long. */
  const withBaseSlot = async (call: () => Promise<Response>): Promise<Response> => {
    if (!(await spacer.take())) {
      return error(503, "gateway busy, try again shortly", { "retry-after": String(Math.ceil(spacer.backlogMs() / 1000)) });
    }
    return call();
  };

  const baseSearch = async (url: URL): Promise<Response> => {
    const params: Record<string, string> = { func: "PerformSearch" };
    for (const [k, v] of url.searchParams) {
      if (k === "func" || k === "apikey") continue;
      if (!BASE_SEARCH_PARAMS.has(k)) return error(400, `unsupported parameter: ${k}`);
      params[k] = v;
    }
    if (!params.query) return error(400, "query is required");
    if (params.hits !== undefined && !(/^\d+$/.test(params.hits) && Number(params.hits) <= MAX_HITS)) {
      return error(400, `hits must be a number up to ${MAX_HITS}`);
    }
    if (params.offset !== undefined && !/^\d+$/.test(params.offset)) return error(400, "offset must be a number");
    return withBaseSlot(() => upstream(baseQuery(params)));
  };

  const loadRepositories = async (): Promise<Response> => {
    const res = await withBaseSlot(() => upstream(baseQuery({ func: "ListRepositories", coll: "" })));
    if (res.ok) {
      const body = await res.text();
      repositories = { body, type: res.headers.get("content-type") ?? "text/xml; charset=UTF-8", at: now() };
      return cachedRepositories();
    }
    // Serve the last good list when BASE fails.
    return repositories ? cachedRepositories() : res;
  };

  const cachedRepositories = () =>
    new Response(repositories!.body, {
      headers: { "content-type": repositories!.type, "cache-control": "public, max-age=86400" },
    });

  const baseRepositories = async (): Promise<Response> => {
    if (repositories && now() - repositories.at < ttl) return cachedRepositories();
    repositoriesLoading ??= loadRepositories().finally(() => {
      repositoriesLoading = null;
    });
    return (await repositoriesLoading).clone();
  };

  const openaire = async (url: URL, kind: string): Promise<Response> => {
    if (openaireUrl === null) return error(404, "not found");
    if (!OPENAIRE_PATHS.has(kind)) return error(404, "not found");
    const base = openaireUrl.endsWith("/") ? openaireUrl : `${openaireUrl}/`;
    return upstream(`${base}search/${kind}${url.search}`);
  };

  const publishMap = async (req: Request, client?: ClientInfo): Promise<Response> => {
    if (!config.maps) return error(404, "not found");
    if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
      return error(415, "send the map as application/json");
    }
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > maxMapBytes) return error(413, "map too large");
    const wait = publishers.hit(client?.address ?? "unknown");
    if (wait > 0) return error(429, "too many maps published", { "retry-after": String(Math.ceil(wait / 1000)) });
    const text = await req.text();
    if (new TextEncoder().encode(text).length > maxMapBytes) return error(413, "map too large");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return error(400, "body is not JSON");
    }
    const checked = validateMap(parsed);
    if ("error" in checked) return error(400, checked.error);
    const body = JSON.stringify(checked.map);
    const id = await mapId(body);
    try {
      await config.maps.store.put(id, body);
    } catch {
      return error(503, "map could not be stored");
    }
    return json(201, { id });
  };

  const getMap = async (id: string): Promise<Response> => {
    if (!config.maps || !MAP_ID.test(id)) return error(404, "not found");
    let body: string | null;
    try {
      body = await config.maps.store.get(id);
    } catch {
      return error(503, "map could not be read");
    }
    if (body === null) return error(404, "not found");
    return new Response(body, {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" },
    });
  };

  const route = async (req: Request, url: URL, client?: ClientInfo): Promise<Response> => {
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/health") return json(200, { status: "ok" });
    const wait = clients.hit(client?.address ?? "unknown");
    if (wait > 0) return error(429, "too many requests", { "retry-after": String(Math.ceil(wait / 1000)) });
    if (path === "/maps") {
      return req.method === "POST" ? publishMap(req, client) : error(405, "method not allowed", { allow: "POST, OPTIONS" });
    }
    const m = /^\/maps\/([^/]+)$/.exec(path);
    if (m) return req.method === "POST" ? error(405, "method not allowed", { allow: "GET, OPTIONS" }) : getMap(m[1]);
    if (req.method === "POST") return error(405, "method not allowed", { allow: "GET, OPTIONS" });
    if (path === "/base/search") return baseSearch(url);
    if (path === "/base/repositories") return baseRepositories();
    const oa = /^\/openaire\/search\/([a-z]+)$/.exec(path);
    if (oa) return openaire(url, oa[1]);
    return error(404, "not found");
  };

  return async (req, client) => {
    const origin = req.headers.get("origin");
    const allowed = origin === null || anyOrigin || origins.has(origin);
    const cors: Record<string, string> = {};
    if (origin !== null && allowed) {
      cors["access-control-allow-origin"] = anyOrigin ? "*" : origin;
      if (!anyOrigin) cors["vary"] = "Origin";
    }
    let res: Response;
    if (!allowed) res = error(403, "origin not allowed");
    else if (req.method === "OPTIONS") {
      res = new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    } else if (!["GET", "HEAD", "POST"].includes(req.method)) res = error(405, "method not allowed", { allow: "GET, POST, OPTIONS" });
    else res = await route(req, new URL(req.url), client);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function error(status: number, message: string, headers: Record<string, string> = {}): Response {
  return json(status, { error: message }, headers);
}
