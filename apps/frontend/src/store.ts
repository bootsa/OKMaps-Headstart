/**
 * The maps a person keeps, on the storage they chose (packages/storage):
 * this browser (IndexedDB, the default), a WebDAV folder, a Solid Pod or an
 * Atomic Data server. Each map is one
 * document: the request that made it and what the visualisation reads.
 */
import {
  agentFromSecret,
  atomicStorage,
  findPod,
  indexedDbStorage,
  MapLibrary,
  solidStorage,
  StorageError,
  webdavStorage,
  type MapSummary,
} from "@okmaps/storage";
import type { MapRecord, SearchRequest } from "./search.ts";
import { solidLogin, solidLogout, solidSession } from "./solid-login.ts";

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
  | { kind: "webdav"; url: string; username?: string; password?: string }
  | { kind: "solid"; issuer: string; container: string }
  | { kind: "atomic"; parent: string; secret: string };

const CHOICE_KEY = "okmaps-storage";
/** A Pod chosen before logging in, waiting for the login to come back. */
const PENDING_KEY = "okmaps-storage-pending";

const str = (v: unknown): v is string => typeof v === "string" && v !== "";

export function readChoice(): StorageChoice {
  try {
    const v = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null");
    if (v?.kind === "webdav" && str(v.url)) return v;
    if (v?.kind === "solid" && str(v.issuer) && str(v.container)) return v;
    if (v?.kind === "atomic" && str(v.parent) && str(v.secret)) return v;
  } catch {
    // unreadable or blocked: fall back to the browser
  }
  return { kind: "browser" };
}

/** Thrown, with status 401, when the Pod's login has ended. */
export class LoggedOut extends StorageError {
  constructor(readonly issuer: string) {
    super("you are not logged in to your Pod", 401);
  }
}

type Library = Pick<MapLibrary<SavedMap>, "storage" | "get" | "save" | "delete" | "list">;

/**
 * Logging in to a Pod passes through the identity provider, and the session
 * lives in one page only. So the map page does not log in: it reads Pod maps
 * from a copy kept in this browser (made whenever the main page reads or
 * saves one), and what it saves waits in that copy until the main page,
 * logged in, sends it on.
 */
let podLogin = true;
export function withoutPodLogin() {
  podLogin = false;
}

const UNSENT = "unsent.json";

function podLibrary(remote: MapLibrary<SavedMap>, online: boolean): Library {
  const copy = new MapLibrary<SavedMap>(indexedDbStorage("okmaps-pod-copy"));
  const unsent = async () => JSON.parse((await copy.storage.get(UNSENT)) ?? "[]") as string[];
  return {
    storage: remote.storage,
    list: () => remote.list(),
    async get(id) {
      const kept = await copy.get(id);
      if (kept || !online) return kept;
      const map = await remote.get(id);
      if (map) await copy.save(map);
      return map;
    },
    async save(map) {
      await copy.save(map);
      if (online) return remote.save(map);
      const ids = await unsent();
      if (!ids.includes(map.id)) await copy.storage.put(UNSENT, JSON.stringify([...ids, map.id]));
    },
    async delete(id) {
      await remote.delete(id);
      await copy.delete(id);
    },
    /** Sends what the map page saved. */
    async sendUnsent() {
      for (const id of await unsent()) {
        const map = await copy.get(id);
        if (map) await remote.save(map);
      }
      await copy.storage.delete(UNSENT);
    },
  } as Library & { sendUnsent(): Promise<void> };
}

async function open(choice: StorageChoice): Promise<Library> {
  if (choice.kind === "webdav") {
    return new MapLibrary<SavedMap>(webdavStorage({ url: choice.url, username: choice.username || undefined, password: choice.password }));
  }
  if (choice.kind === "atomic") {
    return new MapLibrary<SavedMap>(atomicStorage({ parent: choice.parent, agent: agentFromSecret(choice.secret) }));
  }
  if (choice.kind === "solid") {
    const session = podLogin ? await solidSession() : null;
    const pod = solidStorage({ container: choice.container, fetch: session?.fetch });
    const out = () => Promise.reject(new LoggedOut(choice.issuer));
    const remote = new MapLibrary<SavedMap>(session ? pod : { label: pod.label, get: out, put: out, delete: out, list: out });
    const lib = podLibrary(remote, !!session);
    if (session) await (lib as Library & { sendUnsent(): Promise<void> }).sendUnsent().catch(() => undefined);
    return lib;
  }
  return new MapLibrary<SavedMap>(indexedDbStorage());
}

let library: Promise<Library> | undefined;
const lib = () => (library ??= open(readChoice()));

export const currentStorage = () => lib().then((l) => l.storage);

/**
 * Switches to another storage after checking it can be read and written.
 * With `copy`, the maps of the current storage are copied there first.
 */
export async function chooseStorage(choice: StorageChoice, copy: boolean): Promise<number> {
  const next = await open(choice);
  await next.storage.put("okmaps.txt", "Maps made with Open Knowledge Maps.\n", "text/plain");
  await next.list();
  let copied = 0;
  if (copy) {
    const now = await lib().catch(() => null);
    for (const s of (await now?.list().catch(() => [])) ?? []) {
      const map = await now!.get(s.id);
      if (map && !(await next.get(map.id))) {
        await next.save(map);
        copied++;
      }
    }
  }
  const before = readChoice();
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // the choice then lasts for this page only
  }
  library = Promise.resolve(next);
  if (before.kind === "solid" && choice.kind !== "solid") await solidLogout().catch(() => undefined);
  return copied;
}

/**
 * Keeping maps in a Pod starts with logging in: the choice is noted and the
 * browser goes to the identity provider. finishSolidLogin completes it when
 * the provider sends the browser back. An empty container means a folder
 * "okmaps/" at the root of the person's Pod.
 */
export async function startSolidLogin(issuer: string, container: string, copy: boolean): Promise<void> {
  localStorage.setItem(PENDING_KEY, JSON.stringify({ issuer, container, copy }));
  await solidLogin(issuer);
}

/** Logs in again to the Pod already chosen. */
export const solidLoginAgain = (issuer: string) => solidLogin(issuer);

/**
 * After a login started by startSolidLogin: switches to the Pod. Null when
 * no login was waiting; throws when it failed.
 */
export async function finishSolidLogin(): Promise<{ copied: number } | null> {
  let pending: { issuer: string; container: string; copy: boolean } | null = null;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null");
    localStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!pending || !str(pending.issuer)) return null;
  const session = await solidSession();
  if (!session) throw new Error("the login did not complete");
  let container = pending.container;
  if (!container) {
    const pod = await findPod(session.webId, session.fetch);
    if (!pod) throw new Error(`no Pod was found for ${session.webId}; give the folder's URL`);
    container = `${pod}okmaps/`;
  }
  return { copied: await chooseStorage({ kind: "solid", issuer: pending.issuer, container }, pending.copy) };
}

export const saveMap = (map: SavedMap) => lib().then((l) => l.save(map)).then(() => map.id);
export const getMap = (id: string) => lib().then((l) => l.get(id));
export const deleteMap = (id: string) => lib().then((l) => l.delete(id));
/** All maps, newest first, without their documents. */
export const listMaps = () => lib().then((l) => l.list());

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
  const kept = await lib();
  for (const m of old) await kept.save(m);
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
