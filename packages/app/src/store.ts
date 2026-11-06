/**
 * The maps a person keeps, on the storage they chose (packages/storage):
 * this browser (IndexedDB, the default) or a WebDAV folder. Each map is one
 * document: the request that made it and what the visualisation reads.
 */
import {
  indexedDbStorage,
  MapLibrary,
  webdavStorage,
  type MapStorage,
  type MapSummary,
} from "../../storage/src/index.ts";
import type { MapRecord, SearchRequest } from "./search.ts";

export type { MapSummary };

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

/** Where maps are kept. Kept in this browser only (localStorage). */
export type StorageChoice =
  | { kind: "browser" }
  | { kind: "webdav"; url: string; username?: string; password?: string };

const CHOICE_KEY = "okmaps-storage";

export function readChoice(): StorageChoice {
  try {
    const v = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null");
    if (v?.kind === "webdav" && typeof v.url === "string") return v;
  } catch {
    // unreadable or blocked: fall back to the browser
  }
  return { kind: "browser" };
}

export function storageFor(choice: StorageChoice): MapStorage {
  if (choice.kind === "webdav") return webdavStorage({ url: choice.url, username: choice.username || undefined, password: choice.password });
  return indexedDbStorage();
}

let library = new MapLibrary<SavedMap>(storageFor(readChoice()));

export const currentStorage = () => library.storage;

/**
 * Switches to another storage after checking it can be read and written.
 * With `copy`, the maps of the current storage are copied there first.
 */
export async function chooseStorage(choice: StorageChoice, copy: boolean): Promise<number> {
  const next = new MapLibrary<SavedMap>(storageFor(choice));
  await next.storage.put("okmaps.txt", "Maps made with Open Knowledge Maps.\n", "text/plain");
  await next.list();
  let copied = 0;
  if (copy) {
    for (const s of await library.list()) {
      const map = await library.get(s.id);
      if (map && !(await next.get(map.id))) {
        await next.save(map);
        copied++;
      }
    }
  }
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // the choice then lasts for this page only
  }
  library = next;
  return copied;
}

export const saveMap = (map: SavedMap) => library.save(map).then(() => map.id);
export const getMap = (id: string) => library.get(id);
export const deleteMap = (id: string) => library.delete(id);
/** All maps, newest first, without their documents. */
export const listMaps = () => library.list();

/**
 * Maps made before storage could be chosen were kept in the IndexedDB
 * database "okmaps"; they are moved into the browser storage once.
 */
export async function moveOldMaps(): Promise<number> {
  if (readChoice().kind !== "browser" || !(await indexedDB.databases?.())?.some((d) => d.name === "okmaps")) return 0;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("okmaps");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const old = db.objectStoreNames.contains("maps")
    ? await new Promise<SavedMap[]>((resolve, reject) => {
        const req = db.transaction("maps").objectStore("maps").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
    : [];
  db.close();
  for (const m of old) await library.save(m);
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("okmaps");
    req.onsuccess = req.onerror = req.onblocked = resolve;
  });
  return old.length;
}

/** Asks the browser not to evict the maps under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
