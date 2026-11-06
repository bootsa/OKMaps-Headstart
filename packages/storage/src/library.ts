/**
 * A person's maps on any storage: each map is maps/<id>.json, and index.json
 * lists them with what the list on the start page shows, so listing does not
 * load every map. If the index is missing or out of step (another device
 * wrote to the same storage), it is rebuilt from the maps themselves.
 */
import type { MapStorage } from "./types.ts";

/** What the list of maps shows. */
export interface MapSummary {
  id: string;
  title: string;
  created: string;
  service: string;
  /** Number of documents in the map. */
  documents: number;
}

export interface StoredMap {
  id: string;
  title: string;
  created: string;
  context: { service: string };
  documents?: unknown[];
}

const INDEX = "index.json";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const mapKey = (id: string) => {
  if (!ID.test(id)) throw new Error(`invalid map id: ${id}`);
  return `maps/${id}.json`;
};
const summary = (m: StoredMap): MapSummary => ({
  id: m.id,
  title: m.title,
  created: m.created,
  service: m.context.service,
  documents: Array.isArray(m.documents) ? m.documents.length : 0,
});

const newestFirst = (list: MapSummary[]) => [...list].sort((a, b) => b.created.localeCompare(a.created));

export class MapLibrary<M extends StoredMap = StoredMap> {
  readonly storage: MapStorage;
  constructor(storage: MapStorage) {
    this.storage = storage;
  }

  async get(id: string): Promise<M | undefined> {
    const body = await this.storage.get(mapKey(id));
    return body === null ? undefined : (JSON.parse(body) as M);
  }

  async save(map: M): Promise<void> {
    await this.storage.put(mapKey(map.id), JSON.stringify(map));
    const index = (await this.readIndex()) ?? (await this.rebuild());
    await this.writeIndex(newestFirst([summary(map), ...index.filter((s) => s.id !== map.id)]));
  }

  async delete(id: string): Promise<void> {
    await this.storage.delete(mapKey(id));
    const index = await this.readIndex();
    if (index) await this.writeIndex(index.filter((s) => s.id !== id));
  }

  /** Newest first. */
  async list(): Promise<MapSummary[]> {
    const [index, keys] = await Promise.all([this.readIndex(), this.storage.list("maps/")]);
    const ids = new Set(keys.filter((k) => k.endsWith(".json")).map((k) => k.slice("maps/".length, -".json".length)));
    if (index && index.length === ids.size && index.every((s) => ids.has(s.id))) return index;
    return this.rebuild();
  }

  /** Reads every map to remake the index. */
  async rebuild(): Promise<MapSummary[]> {
    const keys = (await this.storage.list("maps/")).filter((k) => k.endsWith(".json"));
    const maps = await Promise.all(keys.map(async (k) => this.storage.get(k)));
    const summaries = maps
      .filter((b): b is string => b !== null)
      .flatMap((b) => {
        try {
          return [summary(JSON.parse(b) as M)];
        } catch {
          return [];
        }
      })
    await this.writeIndex(newestFirst(summaries));
    return newestFirst(summaries);
  }

  private async readIndex(): Promise<MapSummary[] | null> {
    const body = await this.storage.get(INDEX);
    if (body === null) return null;
    try {
      const v = JSON.parse(body);
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }

  private async writeIndex(index: MapSummary[]): Promise<void> {
    await this.storage.put(INDEX, JSON.stringify(index));
  }
}
