/**
 * The maps a person keeps, in the stores they set up on the settings page
 * (settings.html): this browser (the default), WebDAV folders, Solid Pods,
 * Atomic Data servers, several of a kind if they like. Each map is one
 * document: the request that made it and what the visualisation reads.
 */
import { indexedDbStorage, MapLibrary, type MapStore, type MapSummary } from "@okmaps/storage";
import { AppSettings, openStore, type SaveTarget, type StoreInstance } from "@okmaps/ui-svelte";
import type { MapRecord, SearchRequest } from "./search.ts";
import { BROWSER_DB, registerAppStoreTypes } from "./stores.ts";

export { LoggedOut } from "./pod-copy.ts";
export { withoutPodLogin } from "./stores.ts";
export type { MapSummary, SaveTarget, StoreInstance };

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

registerAppStoreTypes();

/** Where maps were kept before there could be several stores (one choice in localStorage). */
const LEGACY_KEY = "okmaps-storage";
const str = (v: unknown): v is string => typeof v === "string" && v !== "";

function legacyStore(): StoreInstance | null {
	try {
		const v = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
		if (v?.kind === "webdav" && str(v.url))
			return {
				id: "webdav",
				type: "webdav",
				name: new URL(v.url).host,
				config: { url: v.url, username: v.username ?? "", password: v.password ?? "" },
			};
		if (v?.kind === "solid" && str(v.issuer) && str(v.container))
			return {
				id: "solid",
				type: "solid",
				name: new URL(v.container).host,
				config: { issuer: v.issuer, container: v.container },
			};
		if (v?.kind === "atomic" && str(v.parent) && str(v.secret))
			return {
				id: "atomic",
				type: "atomic",
				name: new URL(v.parent).host,
				config: { parent: v.parent, secret: v.secret },
			};
	} catch {
		// unreadable or blocked
	}
	return null;
}

let settings: AppSettings | undefined;

/**
 * The settings, starting with this browser's store (and the storage chosen
 * before there were several, which stays the default).
 */
export function appSettings(): AppSettings {
	settings ??= new AppSettings({
		seed: () => {
			const browser: StoreInstance = {
				id: "browser",
				type: "browser",
				name: "This browser",
				config: { db: BROWSER_DB },
			};
			const old = legacyStore();
			return { stores: old ? [browser, old] : [browser], saveTo: { store: (old ?? browser).id, path: [] } };
		},
	});
	return settings;
}

const opened = new Map<string, Promise<MapStore<SavedMap>>>();

/** Opens a store from the settings (once per page). */
export function storeById(id: string): Promise<MapStore<SavedMap>> {
	const instance = appSettings().store(id);
	if (!instance) return Promise.reject(new Error("that store is not in your settings"));
	const key = JSON.stringify(instance);
	let store = opened.get(key);
	if (!store) {
		store = openStore(instance) as Promise<MapStore<SavedMap>>;
		opened.set(key, store);
		store.catch(() => opened.delete(key));
	}
	return store;
}

/** The store and folder new maps go to, or null when there is no store. */
export function saveTarget(): { store: StoreInstance; path: string[] } | null {
	const s = appSettings();
	const target: SaveTarget = s.saveTo;
	if (target !== "none") {
		const store = s.store(target.store);
		if (store) return { store, path: target.path };
	}
	return s.stores[0] ? { store: s.stores[0], path: [] } : null;
}

/** map.html's link to a saved map. */
export function mapUrl(storeId: string, path: readonly string[], id: string): string {
	const q = new URLSearchParams({ store: storeId });
	if (path.length) q.set("path", path.join("/"));
	q.set("id", id);
	return `map.html?${q}`;
}

/** Where map.html?store=..&path=..&id=.. points (no store: the default one). */
export function mapAddress(params: URLSearchParams): { store?: string; path: string[]; id: string | null } {
	const path = params.get("path");
	return { store: params.get("store") ?? undefined, path: path ? path.split("/") : [], id: params.get("id") };
}

/**
 * Finds a saved map: in the store and folder named, or (old links without a
 * store) in the top folder of the default store and then of the others.
 */
export async function findMap(
	address: ReturnType<typeof mapAddress>,
): Promise<{ map: SavedMap; store: MapStore<SavedMap>; path: string[] } | undefined> {
	if (!address.id) return undefined;
	const s = appSettings();
	const ids = address.store
		? [address.store]
		: [saveTarget()?.store.id, ...s.stores.map((x) => x.id)].filter(
				(x, i, all): x is string => !!x && all.indexOf(x) === i,
			);
	for (const id of ids) {
		const store = await storeById(id).catch(() => undefined);
		const path = address.store ? address.path : [];
		const map = await store?.get(path, address.id).catch(() => undefined);
		if (store && map) return { map, store, path };
	}
	return undefined;
}

/**
 * Maps made before storage could be chosen were kept in the IndexedDB
 * database "okmaps"; they are moved into this browser's first store once.
 */
export async function moveOldMaps(): Promise<number> {
	if (!(await indexedDB.databases?.())?.some((d) => d.name === "okmaps")) return 0;
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
	const kept = new MapLibrary<SavedMap>(indexedDbStorage(BROWSER_DB));
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
