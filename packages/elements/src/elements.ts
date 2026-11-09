/**
 * The web components: OKMaps parts as HTML tags, for plain pages and any
 * framework. They draw into themselves (light DOM, no shadow root), so the
 * page's tokens, skins (data-skin) and scheme (data-scheme) style them.
 *
 *   <okmaps-map src="map.json"></okmaps-map>
 *   <okmaps-search settings-href="settings.html"></okmaps-search>
 *   <okmaps-settings home="./"></okmaps-settings>
 *   <okmaps-explorer map-href="map.html?store={store}&path={path}&id={id}"></okmaps-explorer>
 *
 * Attributes take strings; properties take anything (records, settings,
 * functions). Changing either draws the part again. Events bubble and are
 * named okmaps-*, see each class.
 */
import { type MapRecord, openStore, type SearchSubmit, type SourceModule, type StoreInstance } from "@okmaps/core";
import type { MapStore } from "@okmaps/storage";
import type { AppSettings, MapRef } from "@okmaps/ui-svelte";
import {
	createExplorer,
	createMap,
	createSearchForm,
	createSettingsPage,
	type MapHandle,
	type MapSnapshot,
	type PartHandle,
} from "./api";

// Lets the module load where there is no DOM (server rendering, tests in Node).
const Base: typeof HTMLElement = globalThis.HTMLElement ?? (class {} as unknown as typeof HTMLElement);

/** Shared plumbing: draw when connected, draw again on changes, take down when removed. */
abstract class OkmapsElement extends Base {
	#part: PartHandle | null = null;
	#queued = false;

	protected abstract draw(): PartHandle | null;

	connectedCallback() {
		// A framework may have set properties before the tag was defined:
		// those shadow the accessors, so set them again through them.
		for (const key of [
			"record",
			"settings",
			"onsearch",
			"viewLabel",
			"combine",
			"mapHref",
			"openStore",
			"serviceLabel",
		]) {
			if (Object.hasOwn(this, key)) {
				const value = (this as Record<string, unknown>)[key];
				delete (this as Record<string, unknown>)[key];
				(this as Record<string, unknown>)[key] = value;
			}
		}
		this.redraw();
	}

	disconnectedCallback() {
		this.#part?.destroy();
		this.#part = null;
	}

	attributeChangedCallback() {
		if (this.isConnected) this.redraw();
	}

	/** Draws the part again (once per task, however many things changed). */
	protected redraw() {
		if (this.#queued) return;
		this.#queued = true;
		queueMicrotask(() => {
			this.#queued = false;
			if (!this.isConnected) return;
			this.#part?.destroy();
			this.#part = null;
			this.replaceChildren();
			this.#part = this.draw();
		});
	}

	protected emit<T>(name: string, detail: T, cancelable = false): CustomEvent<T> {
		const event = new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable });
		this.dispatchEvent(event);
		return event;
	}

	/** Settings given as a property; undefined means the page's shared settings. */
	#settings: AppSettings | undefined;
	get settings(): AppSettings | undefined {
		return this.#settings;
	}
	set settings(value: AppSettings | undefined) {
		this.#settings = value;
		this.redraw();
	}
}

/**
 * <okmaps-map>: a map, from the `record` property or the JSON at `src`.
 *
 * Attributes: src, vis-type, height (px), menu (CSS selector of an element
 * whose contents go in the settings panel).
 * Events: okmaps-ready (detail: the MapHandle), okmaps-change (detail: a
 * MapSnapshot after each zoom, selection, search...), okmaps-error (detail:
 * { error }).
 * Methods: zoomIn, zoomOut, selectPaper, deselectPaper, and `handle` for
 * the rest of the MapHandle.
 */
export class OkmapsMapElement extends OkmapsElement {
	static observedAttributes = ["src", "vis-type", "height", "menu"];
	#record: MapRecord | undefined;
	#handle: MapHandle | null = null;
	#loading = 0;

	get record(): MapRecord | undefined {
		return this.#record;
	}
	set record(value: MapRecord | undefined) {
		this.#record = value;
		this.redraw();
	}

	/** The drawn map's handle (null until okmaps-ready). */
	get handle(): MapHandle | null {
		return this.#handle;
	}

	zoomIn(uri: string) {
		this.#handle?.zoomIn(uri);
	}
	zoomOut() {
		this.#handle?.zoomOut();
	}
	selectPaper(safeId: string) {
		this.#handle?.selectPaper(safeId);
	}
	deselectPaper() {
		this.#handle?.deselectPaper();
	}

	protected draw(): PartHandle | null {
		this.#handle = null;
		const src = this.getAttribute("src");
		if (!this.#record && src) {
			const ticket = ++this.#loading;
			fetch(src)
				.then((r) => {
					if (!r.ok) throw new Error(`${src}: ${r.status} ${r.statusText}`);
					return r.json() as Promise<MapRecord>;
				})
				.then((record) => {
					if (ticket !== this.#loading) return;
					this.#record = record;
					this.redraw();
				})
				.catch((error) => this.emit("okmaps-error", { error }));
			return null;
		}
		if (!this.#record) return null;
		const height = Number(this.getAttribute("height"));
		const menuSelector = this.getAttribute("menu");
		try {
			const handle = createMap(this, this.#record, {
				visType: this.getAttribute("vis-type") ?? undefined,
				height: height > 0 ? height : undefined,
				menu: menuSelector ? document.querySelector<HTMLElement>(menuSelector) : null,
			});
			handle.on("change", (s) => this.emit<MapSnapshot>("okmaps-change", s));
			this.#handle = handle;
			this.emit("okmaps-ready", handle);
			return {
				destroy: () => {
					if (this.#handle === handle) this.#handle = null;
					handle.destroy();
				},
			};
		} catch (error) {
			this.emit("okmaps-error", { error });
			return null;
		}
	}

	override disconnectedCallback() {
		this.#loading++;
		super.disconnectedCallback();
	}
}

type Combine = (parts: { source: SourceModule; request: unknown }[], query: string, view: string) => unknown;

/** What okmaps-search carries: the search, and waitUntil to report how making the map went. */
export interface SearchEventDetail extends SearchSubmit {
	/** Pass the promise that makes the map; a rejection's message is shown in the form. */
	waitUntil(work: Promise<unknown>): void;
}

/**
 * <okmaps-search>: the search form (fields of the enabled sources, map
 * type, where to keep the map).
 *
 * Attributes: settings-href.
 * Properties: settings, onsearch (or listen for the event), viewLabel, combine.
 * Events: okmaps-search (detail: SearchEventDetail). Call
 * `event.detail.waitUntil(promise)` with the work that makes the map.
 */
export class OkmapsSearchElement extends OkmapsElement {
	static observedAttributes = ["settings-href"];
	declare onsearch: ((search: SearchSubmit) => Promise<void>) | undefined;
	declare viewLabel: ((view: string) => string | undefined) | undefined;
	#combine: Combine | undefined;

	/** Makes one request of several sources' requests; with it the form offers "Several sources". */
	get combine(): Combine | undefined {
		return this.#combine;
	}
	set combine(value: Combine | undefined) {
		this.#combine = value;
		this.redraw();
	}

	protected draw(): PartHandle {
		return createSearchForm(this, {
			settings: this.settings,
			settingsHref: this.getAttribute("settings-href") ?? undefined,
			viewLabel: (view) => this.viewLabel?.(view),
			combine: this.#combine,
			onsearch: async (search) => {
				const work: Promise<unknown>[] = [];
				if (this.onsearch) work.push(this.onsearch(search));
				this.emit<SearchEventDetail>("okmaps-search", {
					...search,
					waitUntil: (p) => void work.push(p),
				});
				await Promise.all(work);
			},
		});
	}
}

/**
 * <okmaps-settings>: the settings page (sources on and off, the person's
 * own sources, map stores).
 *
 * Attributes: home (the back link), notice, notice-error.
 * Properties: settings.
 */
export class OkmapsSettingsElement extends OkmapsElement {
	static observedAttributes = ["home", "notice", "notice-error"];

	protected draw(): PartHandle {
		return createSettingsPage(this, {
			settings: this.settings,
			home: this.getAttribute("home") ?? undefined,
			notice: this.getAttribute("notice") ?? "",
			noticeError: this.hasAttribute("notice-error"),
		});
	}
}

/** Fills {store}, {path} (folders joined by "/") and {id} in a link template, URL-encoded. */
export function fillMapHref(template: string, store: string, path: readonly string[], id: string): string {
	return template
		.replaceAll("{store}", encodeURIComponent(store))
		.replaceAll("{path}", encodeURIComponent(path.join("/")))
		.replaceAll("{id}", encodeURIComponent(id));
}

/**
 * <okmaps-explorer>: the saved maps drawer (each store with its folders
 * and maps; move, delete, drag and drop).
 *
 * Attributes: open, map-href (template with {store}, {path}, {id}; default
 * "map.html?store={store}&path={path}&id={id}"), settings-href,
 * toggle="false" (no "Your maps" button).
 * Properties: settings, mapHref, openStore, serviceLabel.
 * Events: okmaps-open-map (detail: { store, path, id }), cancelable: call
 * preventDefault() to handle the link yourself.
 */
export class OkmapsExplorerElement extends OkmapsElement {
	static observedAttributes = ["open", "map-href", "settings-href", "toggle"];
	declare mapHref: ((store: string, path: readonly string[], id: string) => string) | undefined;
	declare openStore: ((instance: StoreInstance) => Promise<MapStore>) | undefined;
	declare serviceLabel: ((service: string) => string) | undefined;

	protected draw(): PartHandle {
		const template = this.getAttribute("map-href") ?? "map.html?store={store}&path={path}&id={id}";
		return createExplorer(this, {
			settings: this.settings,
			open: this.hasAttribute("open"),
			mapHref: (store, path, id) => this.mapHref?.(store, path, id) ?? fillMapHref(template, store, path, id),
			openStore: (instance) => (this.openStore ?? openStore)(instance),
			serviceLabel: (service) => this.serviceLabel?.(service) ?? service,
			settingsHref: this.getAttribute("settings-href") ?? undefined,
			toggle: this.getAttribute("toggle") !== "false",
			onopenmap: (e: MouseEvent, map: MapRef) => {
				if (this.emit("okmaps-open-map", map, true).defaultPrevented) e.preventDefault();
			},
		});
	}
}

export const elements = {
	"okmaps-map": OkmapsMapElement,
	"okmaps-search": OkmapsSearchElement,
	"okmaps-settings": OkmapsSettingsElement,
	"okmaps-explorer": OkmapsExplorerElement,
} as const;

/** Defines the tags (once; tags someone else defined are left alone). */
export function defineElements(registry: CustomElementRegistry = customElements): void {
	for (const [tag, cls] of Object.entries(elements)) if (!registry.get(tag)) registry.define(tag, cls);
}

declare global {
	interface HTMLElementTagNameMap {
		"okmaps-map": OkmapsMapElement;
		"okmaps-search": OkmapsSearchElement;
		"okmaps-settings": OkmapsSettingsElement;
		"okmaps-explorer": OkmapsExplorerElement;
	}
}
