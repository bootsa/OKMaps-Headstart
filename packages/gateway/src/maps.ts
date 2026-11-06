/**
 * Published maps: what a share link points to. A map is stored once,
 * under an id derived from its content, and never changes.
 */
import { bucketStorage, memoryStorage, type MapStorage, type ObjectBucket } from "../../storage/src/index.ts";

export type { ObjectBucket };

/** Where published maps are kept. Ids are checked before they reach the store. */
export interface MapStore {
  get(id: string): Promise<string | null>;
  /** Stores the body under the id; a second put of the same id may be ignored. */
  put(id: string, body: string): Promise<void>;
}

/** Keeps published maps on any storage (packages/storage), as <id>.json in its root. */
export function storageMapStore(storage: MapStorage): MapStore {
  return {
    get: (id) => storage.get(`${id}.json`),
    put: (id, body) => storage.put(`${id}.json`, body, "application/json"),
  };
}

/** Keeps maps in memory (tests, local development). */
export const memoryStore = (): MapStore => storageMapStore(memoryStorage());

/** Keeps maps in an object store binding (Cloudflare R2 or similar), as maps/<id>.json. */
export const bucketStore = (bucket: ObjectBucket, prefix = "maps/"): MapStore => storageMapStore(bucketStorage(bucket, prefix));

/** 24 lowercase hex characters (96 bits of SHA-256). */
export const MAP_ID = /^[0-9a-f]{24}$/;

export const SERVICES = new Set(["pubmed", "base", "openaire"]);

export interface PublishedMap {
  title: string;
  context: { id: string; query: string; service: string; timestamp: string; params: string };
  documents: Record<string, unknown>[];
}

const MAX_DOCUMENTS = 1000;

/** Checks the shape of a map to publish; returns the map with only the known top-level fields, or an error. */
export function validateMap(value: unknown): { map: PublishedMap } | { error: string } {
  if (typeof value !== "object" || value === null) return { error: "body must be a JSON object" };
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || v.title.length > 500) return { error: "title must be a string" };
  const c = v.context as Record<string, unknown> | undefined;
  if (typeof c !== "object" || c === null) return { error: "context is required" };
  for (const k of ["id", "query", "service", "timestamp", "params"]) {
    if (typeof c[k] !== "string") return { error: `context.${k} must be a string` };
  }
  if (!SERVICES.has(c.service as string)) return { error: "unknown service" };
  if (!Array.isArray(v.documents) || v.documents.length === 0 || v.documents.length > MAX_DOCUMENTS) {
    return { error: `documents must be a list of 1 to ${MAX_DOCUMENTS} records` };
  }
  for (const d of v.documents) {
    if (typeof d !== "object" || d === null || Array.isArray(d)) return { error: "each document must be an object" };
    const doc = d as Record<string, unknown>;
    if (typeof doc.id !== "string" || typeof doc.area !== "string") return { error: "each document needs id and area" };
    if (!Number.isFinite(Number(doc.x)) || !Number.isFinite(Number(doc.y))) return { error: "each document needs x and y" };
  }
  const context = { id: c.id, query: c.query, service: c.service, timestamp: c.timestamp, params: c.params } as PublishedMap["context"];
  return { map: { title: v.title, context, documents: v.documents as Record<string, unknown>[] } };
}

/** The id of a map body: the first 96 bits of its SHA-256, in hex. */
export async function mapId(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
