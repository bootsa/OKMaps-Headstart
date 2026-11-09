/**
 * The person's settings: which metadata sources are on, the sources they
 * set up themselves, their map stores and where a new map is saved. Kept in this browser (localStorage), which
 * also holds store passwords and secrets, as before.
 */
import type { FolderPath } from "@okmaps/storage";
import { ownSourceId, type SourceInstance, type StoreInstance } from "./registry";

/** Where a new map goes: a folder of a store, or nowhere (saved later from the map page). */
export type SaveTarget = { store: string; path: string[] } | "none";

export interface SettingsData {
	version: 1;
	/** Sources switched off; new sources start switched on. */
	disabledSources: string[];
	/** Sources set up on the settings page (missing in settings saved before they existed). */
	sources?: SourceInstance[];
	stores: StoreInstance[];
	saveTo: SaveTarget;
}

export interface SettingsOptions {
	/** localStorage key. */
	key?: string;
	/** The stores to start with when there are no settings yet (e.g. migrated ones). */
	seed?: () => { stores: StoreInstance[]; saveTo?: SaveTarget };
	storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

type SettingsState = Required<Omit<SettingsData, "version">>;

export const SETTINGS_KEY = "okmaps-settings";

const isStore = (s: unknown): s is StoreInstance => {
	const v = s as StoreInstance;
	return !!v && typeof v.id === "string" && typeof v.type === "string" && typeof v.name === "string";
};

function browserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/** A short random id for a new store. */
export function newStoreId(): string {
	return Math.random().toString(36).slice(2, 10);
}

/**
 * Plain TypeScript, no framework: read the fields, change them only with
 * the methods, and `subscribe` to hear about changes. A UI layer hooks its
 * own reactivity into `observe()` (ui-svelte does this with Svelte's
 * createSubscriber), so its components update when the settings change.
 */
export class AppSettings {
	#data: SettingsState = {
		disabledSources: [],
		sources: [],
		stores: [],
		saveTo: "none",
	};
	readonly #listeners = new Set<() => void>();
	readonly #key: string;
	readonly #storage: Pick<Storage, "getItem" | "setItem"> | null;

	constructor(options: SettingsOptions = {}) {
		this.#key = options.key ?? SETTINGS_KEY;
		this.#storage = options.storage === undefined ? browserStorage() : options.storage;
		const saved = this.#read();
		if (saved) {
			this.#data = {
				disabledSources: saved.disabledSources,
				sources: saved.sources ?? [],
				stores: saved.stores,
				saveTo: saved.saveTo,
			};
		} else {
			const seed = options.seed?.() ?? { stores: [] };
			this.#data.stores = seed.stores;
			this.#data.saveTo = seed.saveTo ?? (seed.stores[0] ? { store: seed.stores[0].id, path: [] } : "none");
			this.#write();
		}
		this.#fixSaveTo();
	}

	/** Sources switched off; new sources start switched on. */
	get disabledSources(): string[] {
		this.observe();
		return this.#data.disabledSources;
	}

	/** The sources the person set up themselves. */
	get sources(): SourceInstance[] {
		this.observe();
		return this.#data.sources;
	}

	/** The person's map stores, in their order. */
	get stores(): StoreInstance[] {
		this.observe();
		return this.#data.stores;
	}

	/** Where a new map is saved. */
	get saveTo(): SaveTarget {
		this.observe();
		return this.#data.saveTo;
	}

	/**
	 * Called whenever a field is read. Does nothing here; a UI layer
	 * overrides it to track the read (see the class comment).
	 */
	protected observe(): void {}

	/** Calls `listener` after every change; returns a function that stops it. */
	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** The settings as plain data (what localStorage keeps). */
	toJSON(): SettingsData {
		return structuredClone({ version: 1, ...this.#data });
	}

	#read(): SettingsData | null {
		try {
			const v = JSON.parse(this.#storage?.getItem(this.#key) ?? "null");
			if (v?.version !== 1 || !Array.isArray(v.stores)) return null;
			const saveTo =
				v.saveTo === "none" || (typeof v.saveTo?.store === "string" && Array.isArray(v.saveTo.path))
					? v.saveTo
					: "none";
			return {
				version: 1,
				disabledSources: Array.isArray(v.disabledSources)
					? v.disabledSources.filter((x: unknown) => typeof x === "string")
					: [],
				sources: Array.isArray(v.sources)
					? v.sources.filter(isStore).map((s: SourceInstance) => ({ ...s, config: { ...(s.config ?? {}) } }))
					: [],
				stores: v.stores.filter(isStore).map((s: StoreInstance) => ({ ...s, config: { ...(s.config ?? {}) } })),
				saveTo,
			};
		} catch {
			return null;
		}
	}

	#write(): void {
		try {
			this.#storage?.setItem(this.#key, JSON.stringify(this.toJSON()));
		} catch {
			// full or blocked: keep them for this page
		}
	}

	/** Changes the data (always to new arrays and objects), writes it and tells the listeners. */
	#change(next: Partial<SettingsState>): void {
		this.#data = { ...this.#data, ...next };
		this.#fixSaveTo();
		this.save();
	}

	/** Writes the settings and tells the listeners; without localStorage they last for this page. */
	save(): void {
		this.#write();
		for (const l of [...this.#listeners]) l();
	}

	/** A save target naming a removed store falls back to the first store. */
	#fixSaveTo() {
		const { saveTo, stores } = this.#data;
		if (saveTo !== "none" && !stores.some((s) => s.id === saveTo.store)) {
			this.#data.saveTo = stores[0] ? { store: stores[0].id, path: [] } : "none";
		}
	}

	sourceEnabled(id: string): boolean {
		return !this.disabledSources.includes(id);
	}

	setSourceEnabled(id: string, on: boolean): void {
		const rest = this.#data.disabledSources.filter((x) => x !== id);
		this.#change({ disabledSources: on ? rest : [...rest, id] });
	}

	source(id: string): SourceInstance | undefined {
		return this.sources.find((s) => s.id === id);
	}

	/** Adds a source of the person's own, or replaces the one with the same id. */
	putSource(instance: SourceInstance): void {
		const list = this.#data.sources;
		const i = list.findIndex((s) => s.id === instance.id);
		this.#change({ sources: i >= 0 ? list.map((s, j) => (j === i ? instance : s)) : [...list, instance] });
	}

	/** Forgets a source of the person's own; maps made with it stay. */
	removeSource(id: string): void {
		const gone = this.#data.sources.find((s) => s.id === id);
		this.#change({
			sources: this.#data.sources.filter((s) => s.id !== id),
			disabledSources: gone
				? this.#data.disabledSources.filter((x) => x !== ownSourceId(gone))
				: this.#data.disabledSources,
		});
	}

	store(id: string): StoreInstance | undefined {
		return this.stores.find((s) => s.id === id);
	}

	/** Adds a store, or replaces the one with the same id. */
	putStore(instance: StoreInstance): void {
		const list = this.#data.stores;
		const i = list.findIndex((s) => s.id === instance.id);
		const stores = i >= 0 ? list.map((s, j) => (j === i ? instance : s)) : [...list, instance];
		const saveTo: SaveTarget =
			this.#data.saveTo === "none" && stores.length === 1 ? { store: instance.id, path: [] } : this.#data.saveTo;
		this.#change({ stores, saveTo });
	}

	/** Forgets a store; the maps in it stay where they are. */
	removeStore(id: string): void {
		this.#change({ stores: this.#data.stores.filter((s) => s.id !== id) });
	}

	setSaveTo(target: SaveTarget): void {
		this.#change({ saveTo: target === "none" ? "none" : { store: target.store, path: [...target.path] } });
	}

	/** The default store (where maps are saved unless the person picks another). */
	defaultStore(): StoreInstance | undefined {
		const saveTo = this.saveTo;
		return saveTo === "none" ? this.stores[0] : this.store(saveTo.store);
	}

	/** Moves a store up or down the list. */
	moveStore(id: string, by: -1 | 1): void {
		const i = this.#data.stores.findIndex((s) => s.id === id);
		const j = i + by;
		if (i < 0 || j < 0 || j >= this.#data.stores.length) return;
		const next = [...this.#data.stores];
		[next[i], next[j]] = [next[j], next[i]];
		this.#change({ stores: next });
	}
}

/** "Reading list / 2026", or "" for the top folder. */
export const pathLabel = (path: FolderPath) => path.join(" / ");
