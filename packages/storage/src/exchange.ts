/**
 * Maps as a file: exporting the maps of a store (or of one folder, with its
 * subfolders) to one JSON document, and importing such a file, or a single
 * map's JSON, into any store. The file is how maps move between stores that
 * cannot see each other, and a backup a person keeps themselves.
 *
 *   { "format": "okmaps-maps", "version": 1, "exported": "2026-11-08T…",
 *     "maps": [{ "path": [], "map": {…} }, { "path": ["Reading list"], "map": {…} }] }
 */
import type { StoredMap } from "./library.ts";
import { checkFolderName, type FolderPath, type MapStore } from "./tree.ts";
import { StorageError } from "./types.ts";

export const MAPS_FILE_FORMAT = "okmaps-maps";

/** One map in a file, with its folder relative to where the export started. */
export interface MapsFileEntry<M extends StoredMap = StoredMap> {
	path: string[];
	map: M;
}

export interface MapsFile<M extends StoredMap = StoredMap> {
	format: typeof MAPS_FILE_FORMAT;
	version: 1;
	/** When the file was made (ISO 8601). */
	exported: string;
	maps: MapsFileEntry<M>[];
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether a value has what every stored map needs (the rest is the map's own business). */
export function isStoredMap(v: unknown): v is StoredMap {
	if (!v || typeof v !== "object") return false;
	const m = v as Record<string, unknown>;
	const context = m.context as Record<string, unknown> | undefined;
	return (
		typeof m.id === "string" &&
		ID.test(m.id) &&
		typeof m.title === "string" &&
		typeof m.created === "string" &&
		!!context &&
		typeof context === "object" &&
		typeof context.service === "string" &&
		(m.documents === undefined || Array.isArray(m.documents))
	);
}

/** Every map in a folder and its subfolders (subfolders only where the store has them). */
export async function exportMaps<M extends StoredMap>(
	store: MapStore<M>,
	path: FolderPath = [],
	now: () => Date = () => new Date(),
): Promise<MapsFile<M>> {
	const maps: MapsFileEntry<M>[] = [];
	const walk = async (rel: string[]) => {
		const here = [...path, ...rel];
		const listing = await store.list(here);
		for (const s of listing.maps) {
			const map = await store.get(here, s.id);
			if (map) maps.push({ path: rel, map });
		}
		for (const name of listing.folders) await walk([...rel, name]);
	};
	await walk([]);
	return { format: MAPS_FILE_FORMAT, version: 1, exported: now().toISOString(), maps };
}

/**
 * The maps in a file: a maps file as exportMaps writes it, or one map's JSON.
 * Throws a StorageError, with what is wrong, for anything else.
 */
export function parseMapsFile(text: string): MapsFileEntry[] {
	let v: unknown;
	try {
		v = JSON.parse(text);
	} catch {
		throw new StorageError("the file is not JSON");
	}
	if (isStoredMap(v)) return [{ path: [], map: v }];
	const file = v as Partial<MapsFile> | null;
	if (!file || file.format !== MAPS_FILE_FORMAT || !Array.isArray(file.maps))
		throw new StorageError("the file is neither a maps file nor a map");
	if (file.version !== 1) throw new StorageError(`maps file version ${file.version} is not known`);
	const entries: MapsFileEntry[] = [];
	for (const e of file.maps) {
		if (!e || !isStoredMap(e.map)) throw new StorageError("the file holds something that is not a map");
		const p = Array.isArray(e.path) ? e.path : [];
		if (!p.every((x) => typeof x === "string")) throw new StorageError("a map in the file has a bad folder");
		entries.push({ path: p.map((x) => checkFolderName(x)), map: e.map });
	}
	return entries;
}

export interface ImportResult {
	/** Maps saved (a map with the same id in the same folder is replaced: it is the same map). */
	maps: number;
	/** Folders made. */
	folders: number;
}

/**
 * Saves the maps into a folder of a store, with their subfolders where the
 * store has folders; a store without folders gets every map at its top.
 */
export async function importMaps<M extends StoredMap>(
	store: MapStore<M>,
	path: FolderPath,
	entries: MapsFileEntry[],
): Promise<ImportResult> {
	const made = new Set<string>();
	let folders = 0;
	const ensure = async (rel: string[]) => {
		for (let i = 1; i <= rel.length; i++) {
			const key = rel.slice(0, i).join("/");
			if (made.has(key)) continue;
			const before = await store.list([...path, ...rel.slice(0, i - 1)]);
			if (!before.folders.includes(rel[i - 1])) {
				await store.createFolder?.([...path, ...rel.slice(0, i - 1)], rel[i - 1]);
				folders++;
			}
			made.add(key);
		}
	};
	for (const { path: rel, map } of entries) {
		const nested = store.createFolder ? rel : [];
		if (nested.length) await ensure(nested);
		await store.save([...path, ...nested], map as M);
	}
	return { maps: entries.length, folders };
}
