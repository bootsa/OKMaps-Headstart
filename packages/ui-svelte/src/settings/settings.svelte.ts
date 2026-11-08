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

export class AppSettings {
	disabledSources: string[] = $state([]);
	sources: SourceInstance[] = $state([]);
	stores: StoreInstance[] = $state([]);
	saveTo: SaveTarget = $state("none");

	readonly #key: string;
	readonly #storage: Pick<Storage, "getItem" | "setItem"> | null;

	constructor(options: SettingsOptions = {}) {
		this.#key = options.key ?? SETTINGS_KEY;
		this.#storage = options.storage === undefined ? browserStorage() : options.storage;
		const saved = this.#read();
		if (saved) {
			this.disabledSources = saved.disabledSources;
			this.sources = saved.sources ?? [];
			this.stores = saved.stores;
			this.saveTo = saved.saveTo;
		} else {
			const seed = options.seed?.() ?? { stores: [] };
			this.stores = seed.stores;
			this.saveTo = seed.saveTo ?? (seed.stores[0] ? { store: seed.stores[0].id, path: [] } : "none");
			this.save();
		}
		this.#fixSaveTo();
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

	/** Writes the settings; without localStorage they last for this page. */
	save(): void {
		const data: SettingsData = {
			version: 1,
			disabledSources: $state.snapshot(this.disabledSources),
			sources: $state.snapshot(this.sources),
			stores: $state.snapshot(this.stores),
			saveTo: $state.snapshot(this.saveTo),
		};
		try {
			this.#storage?.setItem(this.#key, JSON.stringify(data));
		} catch {
			// full or blocked: keep them for this page
		}
	}

	/** A save target naming a removed store falls back to the first store. */
	#fixSaveTo() {
		if (this.saveTo !== "none" && !this.store(this.saveTo.store)) {
			this.saveTo = this.stores[0] ? { store: this.stores[0].id, path: [] } : "none";
		}
	}

	sourceEnabled(id: string): boolean {
		return !this.disabledSources.includes(id);
	}

	setSourceEnabled(id: string, on: boolean): void {
		const rest = this.disabledSources.filter((x) => x !== id);
		this.disabledSources = on ? rest : [...rest, id];
		this.save();
	}

	source(id: string): SourceInstance | undefined {
		return this.sources.find((s) => s.id === id);
	}

	/** Adds a source of the person's own, or replaces the one with the same id. */
	putSource(instance: SourceInstance): void {
		const i = this.sources.findIndex((s) => s.id === instance.id);
		if (i >= 0) this.sources[i] = instance;
		else this.sources.push(instance);
		this.save();
	}

	/** Forgets a source of the person's own; maps made with it stay. */
	removeSource(id: string): void {
		const gone = this.sources.find((s) => s.id === id);
		this.sources = this.sources.filter((s) => s.id !== id);
		if (gone) this.disabledSources = this.disabledSources.filter((x) => x !== ownSourceId(gone));
		this.save();
	}

	store(id: string): StoreInstance | undefined {
		return this.stores.find((s) => s.id === id);
	}

	/** Adds a store, or replaces the one with the same id. */
	putStore(instance: StoreInstance): void {
		const i = this.stores.findIndex((s) => s.id === instance.id);
		if (i >= 0) this.stores[i] = instance;
		else this.stores.push(instance);
		if (this.saveTo === "none" && this.stores.length === 1) this.saveTo = { store: instance.id, path: [] };
		this.save();
	}

	/** Forgets a store; the maps in it stay where they are. */
	removeStore(id: string): void {
		this.stores = this.stores.filter((s) => s.id !== id);
		this.#fixSaveTo();
		this.save();
	}

	setSaveTo(target: SaveTarget): void {
		this.saveTo = target === "none" ? "none" : { store: target.store, path: [...target.path] };
		this.#fixSaveTo();
		this.save();
	}

	/** The default store (where maps are saved unless the person picks another). */
	defaultStore(): StoreInstance | undefined {
		return this.saveTo === "none" ? this.stores[0] : this.store(this.saveTo.store);
	}

	/** Moves a store up or down the list. */
	moveStore(id: string, by: -1 | 1): void {
		const i = this.stores.findIndex((s) => s.id === id);
		const j = i + by;
		if (i < 0 || j < 0 || j >= this.stores.length) return;
		const next = [...this.stores];
		[next[i], next[j]] = [next[j], next[i]];
		this.stores = next;
		this.save();
	}
}

/** "Reading list / 2026", or "" for the top folder. */
export const pathLabel = (path: FolderPath) => path.join(" / ");
