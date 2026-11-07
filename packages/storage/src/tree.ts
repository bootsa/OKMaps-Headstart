/**
 * Folders of maps on any storage. A folder is a MapLibrary of its own
 * (index.json and maps/<id>.json) under a key prefix, and folders.json
 * names its subfolders, which live under folders/<name>/. The top folder
 * is the storage's root, so maps saved before folders existed stay where
 * they are. Storages list documents only, so folders.json is what makes an
 * empty folder exist.
 *
 *   index.json  maps/a.json  folders.json  ["Reading list"]
 *   folders/Reading list/index.json  folders/Reading list/maps/b.json
 */
import { MapLibrary, type MapSummary, type StoredMap } from "./library.ts";
import { checkKey, checkPrefix, type MapStorage, StorageError } from "./types.ts";

/** Folder names from the top: [] is the top folder, ["a", "b"] is b inside a. */
export type FolderPath = readonly string[];

export interface FolderListing {
	/** Subfolder names, sorted. */
	folders: string[];
	/** Newest first. */
	maps: MapSummary[];
}

const FOLDERS = "folders.json";

/** A storage seen from a folder inside it. */
export function prefixedStorage(storage: MapStorage, prefix: string): MapStorage {
	checkPrefix(prefix);
	if (!prefix) return storage;
	const strip = (keys: string[]) => keys.map((k) => k.slice(prefix.length));
	return {
		label: storage.label,
		get: (key) => storage.get(prefix + checkKey(key)),
		put: (key, body, type) => storage.put(prefix + checkKey(key), body, type),
		delete: (key) => storage.delete(prefix + checkKey(key)),
		list: async (sub = "") => strip(await storage.list(prefix + checkPrefix(sub))),
	};
}

/** Folder names are one path part: not empty, no "/", "\" or control characters, not "." or "..". */
export function checkFolderName(name: string): string {
	const n = name.trim();
	if (!n || n.length > 100 || n === "." || n === ".." || /[/\\\u0000-\u001f]/.test(n)) {
		throw new StorageError(`invalid folder name: ${JSON.stringify(name)}`);
	}
	return n;
}

export function folderPrefix(path: FolderPath): string {
	return path.map((name) => `folders/${checkFolderName(name)}/`).join("");
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

export class MapTree<M extends StoredMap = StoredMap> {
	readonly storage: MapStorage;
	constructor(storage: MapStorage) {
		this.storage = storage;
	}

	/** The maps directly in a folder. */
	library(path: FolderPath = []): MapLibrary<M> {
		return new MapLibrary<M>(prefixedStorage(this.storage, folderPrefix(path)));
	}

	async folders(path: FolderPath = []): Promise<string[]> {
		const body = await this.storage.get(folderPrefix(path) + FOLDERS);
		if (body === null) return [];
		try {
			const v = JSON.parse(body);
			return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").sort(byName) : [];
		} catch {
			return [];
		}
	}

	async list(path: FolderPath = []): Promise<FolderListing> {
		const [folders, maps] = await Promise.all([this.folders(path), this.library(path).list()]);
		return { folders, maps };
	}

	get(path: FolderPath, id: string): Promise<M | undefined> {
		return this.library(path).get(id);
	}

	save(path: FolderPath, map: M): Promise<void> {
		return this.library(path).save(map);
	}

	delete(path: FolderPath, id: string): Promise<void> {
		return this.library(path).delete(id);
	}

	/** Makes a subfolder; making one that is there already is not an error. */
	async createFolder(path: FolderPath, name: string): Promise<string> {
		const n = checkFolderName(name);
		const names = await this.folders(path);
		if (!names.includes(n)) await this.writeFolders(path, [...names, n]);
		return n;
	}

	/** Removes a subfolder with everything in it. */
	async deleteFolder(path: FolderPath, name: string): Promise<void> {
		const n = checkFolderName(name);
		await this.removeAll(folderPrefix([...path, n]));
		await this.writeFolders(
			path,
			(await this.folders(path)).filter((x) => x !== n),
		);
	}

	/**
	 * Renames a subfolder. Storages have no rename, so everything in it is
	 * copied to the new name and then removed from the old one.
	 */
	async renameFolder(path: FolderPath, from: string, to: string): Promise<string> {
		const a = checkFolderName(from);
		const b = checkFolderName(to);
		if (a === b) return b;
		const names = await this.folders(path);
		if (!names.includes(a)) throw new StorageError(`no folder ${JSON.stringify(a)}`);
		if (names.includes(b)) throw new StorageError(`there is a folder ${JSON.stringify(b)} already`);
		await this.copyAll(folderPrefix([...path, a]), folderPrefix([...path, b]));
		await this.writeFolders(path, [...names.filter((x) => x !== a), b]);
		await this.removeAll(folderPrefix([...path, a]));
		return b;
	}

	private async writeFolders(path: FolderPath, names: string[]): Promise<void> {
		await this.storage.put(folderPrefix(path) + FOLDERS, JSON.stringify([...new Set(names)].sort(byName)));
	}

	/** The documents of a folder and its subfolders (keys under `prefix`). */
	private async keysUnder(prefix: string): Promise<string[]> {
		const own = [...(await this.storage.list(prefix)), ...(await this.storage.list(`${prefix}maps/`))];
		const body = own.includes(prefix + FOLDERS) ? await this.storage.get(prefix + FOLDERS) : null;
		let subs: string[] = [];
		try {
			subs = body ? (JSON.parse(body) as string[]).filter((x) => typeof x === "string") : [];
		} catch {
			// an unreadable folders.json names no subfolders
		}
		const nested = await Promise.all(subs.map((s) => this.keysUnder(`${prefix}folders/${checkFolderName(s)}/`)));
		return [...own, ...nested.flat()];
	}

	private async copyAll(from: string, to: string): Promise<void> {
		for (const key of await this.keysUnder(from)) {
			const body = await this.storage.get(key);
			if (body !== null) await this.storage.put(to + key.slice(from.length), body);
		}
	}

	private async removeAll(prefix: string): Promise<void> {
		for (const key of await this.keysUnder(prefix)) await this.storage.delete(key);
	}
}

/**
 * One place a person keeps maps, as the settings page lists it: a named
 * instance of a store type (several of one type are fine). Stores that
 * cannot hold folders leave out the folder methods and only use [].
 */
export interface MapStore<M extends StoredMap = StoredMap> {
	/** The instance's id in the settings. */
	readonly id: string;
	/** The name the person gave it. */
	readonly name: string;
	/** Its store type ("browser", "webdav", ...). */
	readonly type: string;
	/** Where it is, for messages ("this browser", a URL). */
	readonly label: string;
	list(path?: FolderPath): Promise<FolderListing>;
	get(path: FolderPath, id: string): Promise<M | undefined>;
	save(path: FolderPath, map: M): Promise<void>;
	delete(path: FolderPath, id: string): Promise<void>;
	createFolder?(path: FolderPath, name: string): Promise<string>;
	renameFolder?(path: FolderPath, from: string, to: string): Promise<string>;
	deleteFolder?(path: FolderPath, name: string): Promise<void>;
}

/** A MapStore on any storage, with folders unless `folders` is false. */
export function treeStore<M extends StoredMap = StoredMap>(
	info: { id: string; name: string; type: string },
	storage: MapStorage,
	options: { folders?: boolean } = {},
): MapStore<M> & { tree: MapTree<M> } {
	const tree = new MapTree<M>(storage);
	const store: MapStore<M> & { tree: MapTree<M> } = {
		...info,
		label: storage.label,
		tree,
		list: (path = []) => tree.list(path),
		get: (path, id) => tree.get(path, id),
		save: (path, map) => tree.save(path, map),
		delete: (path, id) => tree.delete(path, id),
	};
	if (options.folders === false) {
		const top = (path: FolderPath) => {
			if (path.length) throw new StorageError(`${info.name} has no folders`);
			return path;
		};
		store.list = async (path = []) => ({ folders: [], maps: (await tree.list(top(path))).maps });
		store.get = async (path, id) => tree.get(top(path), id);
		store.save = async (path, map) => tree.save(top(path), map);
		store.delete = async (path, id) => tree.delete(top(path), id);
	} else {
		store.createFolder = (path, name) => tree.createFolder(path, name);
		store.renameFolder = (path, from, to) => tree.renameFolder(path, from, to);
		store.deleteFolder = (path, name) => tree.deleteFolder(path, name);
	}
	return store;
}

/** Where a map is: a store and a folder in it. */
export interface MapPlace<M extends StoredMap = StoredMap> {
	store: MapStore<M>;
	path: FolderPath;
}

const samePlace = (a: MapPlace<StoredMap>, b: MapPlace<StoredMap>) =>
	a.store === b.store && a.path.length === b.path.length && a.path.every((p, i) => p === b.path[i]);

/**
 * Moves a map to another folder or store: saved there first, then removed
 * here, so a failure leaves it where it was (or in both places).
 */
export async function moveMap<M extends StoredMap>(from: MapPlace<M>, to: MapPlace<M>, id: string): Promise<void> {
	if (samePlace(from, to)) return;
	const map = await from.store.get(from.path, id);
	if (!map) throw new StorageError(`no map ${id} in ${from.store.name}`);
	await to.store.save(to.path, map);
	await from.store.delete(from.path, id);
}
