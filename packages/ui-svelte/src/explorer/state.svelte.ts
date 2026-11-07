/**
 * What the map explorer knows: the stores opened so far and the folders
 * listed so far. Listing is lazy: a store or folder is read when it is
 * first expanded, and again after a change in it.
 */
import { type FolderListing, type FolderPath, type MapStore, moveMap } from "@okmaps/storage";
import { openStore, type StoreInstance } from "../settings/registry";
import type { AppSettings } from "../settings/settings.svelte";

export interface Listing {
	status: "loading" | "ready" | "error";
	folders: string[];
	maps: FolderListing["maps"];
	error?: unknown;
}

/** A map's place, as dragged or moved. */
export interface MapRef {
	store: string;
	path: string[];
	id: string;
}

export const placeKey = (store: string, path: FolderPath) => [store, ...path].join("\u0000");

export class ExplorerState {
	readonly settings: AppSettings;
	readonly #open: (instance: StoreInstance) => Promise<MapStore>;
	readonly #stores = new Map<string, Promise<MapStore>>();
	listings: Record<string, Listing> = $state({});
	expanded: Record<string, boolean> = $state({});
	/** The last problem, for the explorer's status line. */
	message = $state("");
	messageError = $state(false);

	constructor(settings: AppSettings, open: (instance: StoreInstance) => Promise<MapStore> = openStore) {
		this.settings = settings;
		this.#open = open;
	}

	store(id: string): Promise<MapStore> {
		const instance = this.settings.store(id);
		if (!instance) return Promise.reject(new Error("that store is not in your settings"));
		let s = this.#stores.get(id);
		if (!s) {
			s = this.#open(instance);
			this.#stores.set(id, s);
			s.catch(() => this.#stores.delete(id));
		}
		return s;
	}

	/** Whether the store can hold folders (known once it is open). */
	async canFold(id: string): Promise<boolean> {
		return !!(await this.store(id)).createFolder;
	}

	listing(store: string, path: FolderPath): Listing | undefined {
		return this.listings[placeKey(store, path)];
	}

	async load(store: string, path: FolderPath): Promise<void> {
		const key = placeKey(store, path);
		const before = this.listings[key];
		this.listings[key] = { status: "loading", folders: before?.folders ?? [], maps: before?.maps ?? [] };
		try {
			const l = await (await this.store(store)).list(path);
			this.listings[key] = { status: "ready", folders: l.folders, maps: l.maps };
		} catch (error) {
			this.listings[key] = { status: "error", folders: [], maps: [], error };
		}
	}

	isExpanded(store: string, path: FolderPath): boolean {
		return !!this.expanded[placeKey(store, path)];
	}

	async toggle(store: string, path: FolderPath, open = !this.isExpanded(store, path)): Promise<void> {
		this.expanded[placeKey(store, path)] = open;
		if (open && this.listing(store, path)?.status !== "ready") await this.load(store, path);
	}

	#say(text: string, error = false) {
		this.message = text;
		this.messageError = error;
	}

	async #run(what: string, fn: () => Promise<unknown>): Promise<boolean> {
		try {
			await fn();
			return true;
		} catch (err) {
			this.#say(`${what} did not work: ${err instanceof Error ? err.message : err}.`, true);
			return false;
		}
	}

	async createFolder(store: string, path: FolderPath, name: string): Promise<boolean> {
		const ok = await this.#run("Making the folder", async () => {
			const s = await this.store(store);
			if (!s.createFolder) throw new Error("this store has no folders");
			await s.createFolder(path, name);
		});
		if (ok) {
			await this.load(store, path);
			this.#say(`Folder ${name.trim()} made.`);
		}
		return ok;
	}

	async renameFolder(store: string, path: FolderPath, from: string, to: string): Promise<boolean> {
		const ok = await this.#run("Renaming the folder", async () => {
			const s = await this.store(store);
			if (!s.renameFolder) throw new Error("this store has no folders");
			await s.renameFolder(path, from, to);
		});
		if (ok) {
			this.#forget(store, [...path, from]);
			await this.load(store, path);
			this.#say(`Folder ${from} renamed to ${to.trim()}.`);
		}
		return ok;
	}

	async deleteFolder(store: string, path: FolderPath, name: string): Promise<boolean> {
		const ok = await this.#run("Deleting the folder", async () => {
			const s = await this.store(store);
			if (!s.deleteFolder) throw new Error("this store has no folders");
			await s.deleteFolder(path, name);
		});
		if (ok) {
			this.#forget(store, [...path, name]);
			await this.load(store, path);
			this.#say(`Folder ${name} deleted.`);
		}
		return ok;
	}

	async deleteMap(ref: MapRef, title: string): Promise<boolean> {
		const ok = await this.#run("Deleting the map", async () => (await this.store(ref.store)).delete(ref.path, ref.id));
		if (ok) {
			await this.load(ref.store, ref.path);
			this.#say(`${title} deleted.`);
		}
		return ok;
	}

	async moveMap(ref: MapRef, to: { store: string; path: string[] }, title: string): Promise<boolean> {
		const same = ref.store === to.store && placeKey(ref.store, ref.path) === placeKey(to.store, to.path);
		if (same) return true;
		const ok = await this.#run("Moving the map", async () => {
			const [from, target] = await Promise.all([this.store(ref.store), this.store(to.store)]);
			await moveMap({ store: from, path: ref.path }, { store: target, path: to.path }, ref.id);
		});
		if (ok) {
			await Promise.all([this.load(ref.store, ref.path), this.load(to.store, to.path)]);
			const where = this.settings.store(to.store)?.name ?? to.store;
			this.#say(`${title} moved to ${[where, ...to.path].join(" / ")}.`);
		}
		return ok;
	}

	/** Drops what is known about a folder and the folders in it. */
	#forget(store: string, path: FolderPath) {
		const prefix = placeKey(store, path);
		for (const key of Object.keys(this.listings))
			if (key === prefix || key.startsWith(`${prefix}\u0000`)) delete this.listings[key];
		for (const key of Object.keys(this.expanded))
			if (key === prefix || key.startsWith(`${prefix}\u0000`)) delete this.expanded[key];
	}
}
