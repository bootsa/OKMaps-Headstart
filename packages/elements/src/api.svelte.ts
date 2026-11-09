/**
 * The plain JavaScript API: each function draws one part of OKMaps into an
 * element and returns a handle to drive it and to take it down again. No
 * framework is needed to call these; Svelte runs inside.
 *
 *   const map = createMap(document.getElementById("map"), record);
 *   map.on("change", (s) => console.log(s.zoomedArea));
 *   map.zoomIn(map.state.map.areas[0].uri);
 */
import type { MapConfig, MapRecord, SearchSubmit, SourceModule, StoreInstance } from "@okmaps/core";
import type { MapStore } from "@okmaps/storage";
import {
	AppSettings,
	MapExplorer,
	type MapRef,
	MapState,
	SearchForm,
	SettingsPage,
	Visualization,
} from "@okmaps/ui-svelte";
import { mount, unmount } from "svelte";

/** What a map shows right now; `change` handlers get it. */
export interface MapSnapshot {
	visType: string;
	/** uri of the area zoomed into, or null for the overview. */
	zoomedArea: string | null;
	/** safeId of the selected paper, or null. */
	selectedPaper: string | null;
	/** Keyword of the selected stream (streamgraphs), or null. */
	selectedStream: string | null;
	/** The list's search words. */
	search: string;
	filter: string;
	sort: string;
	/** safeIds of the papers the list shows, in order. */
	listed: string[];
}

export interface MapOptions {
	/** Overrides the service's settings, e.g. { visType: "geomap" }. */
	config?: Partial<MapConfig>;
	/** Shorthand for config.visType. */
	visType?: string;
	/** Height of the whole interface in px (default: the window's). */
	height?: number;
	/** More for the settings panel, e.g. the page's own links. */
	menu?: HTMLElement | null;
	/** Chart size the map is first laid out for (px, default 600; it is rescaled to fit). */
	size?: number;
}

export interface MapHandle {
	/**
	 * The map's state: read anything (state.map.areas, state.listed, ...).
	 * Prefer the methods below to change it.
	 */
	readonly state: MapState;
	/** What the map shows right now, as plain data. */
	snapshot(): MapSnapshot;
	zoomIn(areaUri: string): void;
	zoomOut(): void;
	selectPaper(safeId: string): void;
	deselectPaper(): void;
	selectStream(key: string | null): void;
	/** Sets the list's search words. */
	setSearch(text: string): void;
	setFilter(filter: string): void;
	setSort(sort: string): void;
	/** Calls `listener` after each change (batched); returns a function that stops it. */
	on(event: "change", listener: (snapshot: MapSnapshot) => void): () => void;
	/** Takes the map out of its element. */
	destroy(): void;
}

function snapshotOf(state: MapState): MapSnapshot {
	return {
		visType: state.config.visType,
		zoomedArea: state.zoomedArea,
		selectedPaper: state.selectedPaper,
		selectedStream: state.selectedStream,
		search: state.search,
		filter: state.filter,
		sort: state.sort,
		listed: state.listed.map((p) => p.safeId),
	};
}

/** Draws a map record (what the pipeline makes) into `target`. */
export function createMap(target: HTMLElement, record: MapRecord, options: MapOptions = {}): MapHandle {
	const config = { ...options.config, ...(options.visType ? { visType: options.visType } : {}) };
	const state = new MapState(record, options.size ?? 600, config as Partial<MapConfig>);
	target.classList.add("okmaps");
	const component = mount(Visualization, {
		target,
		props: { state, menu: options.menu ?? null, height: options.height },
	});

	const listeners = new Set<(s: MapSnapshot) => void>();
	// Effects run after the current task, so compare with what the map showed
	// when it was drawn, not with the effect's first run.
	let last = JSON.stringify(snapshotOf(state));
	const stopWatching = $effect.root(() => {
		$effect(() => {
			const snap = snapshotOf(state);
			const key = JSON.stringify(snap);
			if (key === last) return;
			last = key;
			for (const l of [...listeners]) l(snap);
		});
	});

	return {
		state,
		snapshot: () => snapshotOf(state),
		zoomIn: (uri) => state.zoomIn(uri),
		zoomOut: () => state.zoomOut(),
		selectPaper: (id) => state.selectPaper(id),
		deselectPaper: () => state.deselectPaper(),
		selectStream: (key) => state.selectStream(key),
		setSearch: (text) => {
			state.search = text;
		},
		setFilter: (filter) => {
			state.filter = filter;
		},
		setSort: (sort) => {
			state.sort = sort;
		},
		on(_event, listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		destroy() {
			listeners.clear();
			stopWatching();
			void unmount(component);
		},
	};
}

let shared: AppSettings | undefined;

/**
 * The person's settings (sources, stores, where maps are saved), one per
 * page, kept in localStorage. The search form, settings page and explorer
 * use it unless they are given other settings, so they stay in step.
 */
export function pageSettings(): AppSettings {
	shared ??= new AppSettings();
	return shared;
}

/** A part drawn by one of the functions below. */
export interface PartHandle {
	destroy(): void;
}

export interface SearchFormOptions {
	/** Default: pageSettings(). */
	settings?: AppSettings;
	/**
	 * Makes the map. A thrown Error's message is shown in the form; call
	 * `search.progress(text)` to show progress under the button.
	 */
	onsearch: (search: SearchSubmit) => Promise<void>;
	/** A longer label for a map type than its view's own. */
	viewLabel?: (view: string) => string | undefined;
	/** Where the settings page is, for the form's hints. */
	settingsHref?: string;
	/** Makes one request of several sources' requests; with it the form offers "Several sources". */
	combine?: (parts: { source: SourceModule; request: unknown }[], query: string, view: string) => unknown;
}

/** Draws the search form: fields of the enabled sources, map type, where to keep the map. */
export function createSearchForm(target: HTMLElement, options: SearchFormOptions): PartHandle {
	target.classList.add("okmaps");
	const component = mount(SearchForm, {
		target,
		props: { ...options, settings: options.settings ?? pageSettings() },
	});
	return { destroy: () => void unmount(component) };
}

export interface SettingsPageOptions {
	/** Default: pageSettings(). */
	settings?: AppSettings;
	/** Where the back link goes (default "./"). */
	home?: string;
	/** A message to show first. */
	notice?: string;
	noticeError?: boolean;
}

/** Draws the settings page: metadata sources on and off, the person's own sources, map stores. */
export function createSettingsPage(target: HTMLElement, options: SettingsPageOptions = {}): PartHandle {
	target.classList.add("okmaps");
	const component = mount(SettingsPage, {
		target,
		props: { ...options, settings: options.settings ?? pageSettings() },
	});
	return { destroy: () => void unmount(component) };
}

export interface ExplorerOptions {
	/** Default: pageSettings(). */
	settings?: AppSettings;
	/** Whether the drawer starts open. */
	open?: boolean;
	/** The link to a saved map. */
	mapHref: (store: string, path: readonly string[], id: string) => string;
	/** Opens a store (default: with its registered type). */
	openStore?: (instance: StoreInstance) => Promise<MapStore>;
	serviceLabel?: (service: string) => string;
	/** Called when a map link is followed. */
	onopenmap?: (e: MouseEvent, map: MapRef) => void;
	/** The settings page, for "Manage stores". */
	settingsHref?: string;
	/** Show a "Your maps" button while the drawer is closed (default true). */
	toggle?: boolean;
}

/** Draws the saved maps drawer: each store with its folders and maps. */
export function createExplorer(target: HTMLElement, options: ExplorerOptions): PartHandle {
	target.classList.add("okmaps");
	const component = mount(MapExplorer, {
		target,
		props: { ...options, settings: options.settings ?? pageSettings() },
	});
	return { destroy: () => void unmount(component) };
}
