/**
 * Maps kept in the browser (IndexedDB). Each map is one record: the
 * request that made it and what the visualisation reads.
 */
import type { MapRecord, SearchRequest } from "./search.ts";

export interface SavedMap extends MapRecord {
  id: string;
  /** ISO time the map was made. */
  created: string;
  request: SearchRequest;
  /** Shown in the list of maps. */
  title: string;
  /** Id of the published copy, once the map has been shared. */
  sharedId?: string;
}

export type MapSummary = Pick<SavedMap, "id" | "created" | "title" | "request"> & { documents: number };

const DB = "okmaps";
const STORE = "maps";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("created", "created");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = f(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const saveMap = (map: SavedMap) => run("readwrite", (s) => s.put(map)).then(() => map.id);
export const getMap = (id: string) => run<SavedMap | undefined>("readonly", (s) => s.get(id));
export const deleteMap = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);

/** All maps, newest first, without their documents. */
export async function listMaps(): Promise<MapSummary[]> {
  const all = await run<SavedMap[]>("readonly", (s) => s.getAll());
  return all
    .map(({ id, created, title, request, documents }) => ({ id, created, title, request, documents: documents.length }))
    .sort((a, b) => b.created.localeCompare(a.created));
}

/** Asks the browser not to evict the maps under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
