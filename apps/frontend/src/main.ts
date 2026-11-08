/**
 * index.html: the search form (from the enabled sources) and the drawer with your maps.
 */

import "@okmaps/ui-svelte/styles.css";
import { MapExplorer, mapStoreTypes, SearchForm, type SearchSubmit } from "@okmaps/ui-svelte";
import { mount } from "svelte";
import { saveDraft } from "./drafts.ts";
import { errorMessage } from "./messages.ts";
import { registerServiceWorker } from "./offline.ts";
import { placeSettings } from "./places.ts";
import type { MapRecord, SearchRequest, Stage } from "./search.ts";
import { settings } from "./settings.ts";
import { solidSession } from "./solid-login.ts";
import { registerAppSources } from "./sources.ts";
import {
	appSettings,
	mapAddress,
	mapUrl,
	moveOldMaps,
	requestPersistence,
	type StoreInstance,
	storeById,
} from "./store.ts";
import { withoutToken } from "./zenodo-source.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
registerAppSources();

const STAGES: Record<Stage, string> = {
	searching: "Searching…",
	citations: "Getting citation counts…",
	layout: "Laying out the map…",
};
const places = placeSettings();
const SERVICES: Record<string, string> = {
	pubmed: "PubMed",
	base: "BASE",
	openaire: "OpenAIRE",
	sparql: "SPARQL",
	zenodo: "Zenodo",
	...Object.fromEntries(places.map((p) => [p.id, p.label])),
};
const VIEWS: Record<string, string> = {
	overview: "Knowledge map: the main areas of the topic",
	timeline: "Streamgraph: how its keywords changed over time",
};

// The Pages build publishes several versions side by side (../versions.html).
if (import.meta.env.VITE_APP_VERSION) {
	const v = $<HTMLParagraphElement>("version");
	const other = Object.assign(document.createElement("a"), {
		href: `${import.meta.env.BASE_URL}../versions.html`,
		textContent: "other versions",
	});
	v.append(`Version ${import.meta.env.VITE_APP_VERSION} · `, other);
	v.hidden = false;
}

function runWorker(request: SearchRequest, progress: (text: string) => void): Promise<MapRecord> {
	const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
	return new Promise<MapRecord>((resolve, reject) => {
		worker.onmessage = (e) => {
			const msg = e.data;
			if (msg.type === "stage") progress(STAGES[msg.stage as Stage]);
			else if (msg.type === "done") resolve(msg.map);
			else if (msg.type === "error") reject(Object.assign(new Error(msg.message), { reasons: msg.reasons }));
		};
		worker.onerror = (e) => reject(new Error(e.message));
		worker.postMessage({ request, settings: { ...settings, places } });
	}).finally(() => worker.terminate());
}

/** Makes the map, keeps it where the form says (or as a draft) and opens it. */
async function makeMap({ request, title, saveTo, progress }: SearchSubmit): Promise<void> {
	progress(STAGES.searching);
	let map: MapRecord;
	try {
		map = await runWorker(request as SearchRequest, progress);
	} catch (err) {
		const reasons = (err as { reasons?: string[] }).reasons ?? [];
		throw new Error(errorMessage(reasons, err instanceof Error ? err.message : String(err)));
	}
	const id = map.context.id;
	const saved = {
		...map,
		id,
		created: new Date().toISOString(),
		request: withoutToken(request as SearchRequest),
		title,
	};
	if (saveTo === "none") {
		await saveDraft(saved);
		location.href = `map.html?draft=${encodeURIComponent(id)}`;
		return;
	}
	try {
		await (await storeById(saveTo.store)).save(saveTo.path, saved);
	} catch (err) {
		// Not lost: open it as a draft, to save somewhere else from the map.
		await saveDraft(saved);
		const name = appSettings().store(saveTo.store)?.name ?? "that store";
		alertLater(`The map could not be kept in ${name}: ${err instanceof Error ? err.message : err}`);
		location.href = `map.html?draft=${encodeURIComponent(id)}`;
		return;
	}
	void requestPersistence();
	location.href = mapUrl(saveTo.store, saveTo.path, id);
}

/** A message for the map page to show (sessionStorage). */
function alertLater(text: string) {
	try {
		sessionStorage.setItem("okmaps-message", text);
	} catch {
		// the map page then shows no message
	}
}

{
	const target = $("search-form");
	target.classList.add("okmaps");
	mount(SearchForm, {
		target,
		props: {
			settings: appSettings(),
			onsearch: makeMap,
			viewLabel: (v: string) => VIEWS[v],
			settingsHref: "settings.html",
		},
	});
}

/** The person's maps: the explorer drawer, open from the start on wide screens. */
function showMaps() {
	const target = document.getElementById("explorer")!;
	target.classList.add("okmaps");
	mount(MapExplorer, {
		target,
		props: {
			settings: appSettings(),
			open: matchMedia("(min-width: 70rem)").matches,
			mapHref: mapUrl,
			openStore: (s: StoreInstance) => storeById(s.id),
			serviceLabel: (service: string) => SERVICES[service] ?? service,
			settingsHref: "settings.html",
			// The map page reads Pod maps from the copy in this browser: make it first.
			onopenmap: async (e: MouseEvent, m: { store: string; path: string[]; id: string }) => {
				if (appSettings().store(m.store)?.type !== "solid") return;
				e.preventDefault();
				const href = (e.currentTarget as HTMLAnchorElement).href;
				await (await storeById(m.store)).get(m.path, m.id).catch(() => undefined);
				location.href = href;
			},
		},
	});
}

/**
 * Back from a login that adding a store started (a Solid Pod): add it and
 * go back to the settings page. True when leaving the page.
 */
async function resumeStores(): Promise<boolean> {
	for (const type of mapStoreTypes()) {
		try {
			const store = await type.resume?.();
			if (!store) continue;
			appSettings().putStore(store);
			location.replace(`settings.html?added=${encodeURIComponent(store.id)}`);
			return true;
		} catch (err) {
			location.replace(`settings.html?failed=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
			return true;
		}
	}
	return false;
}

/**
 * ?open=<id>&store=..: the map page asks for a Pod map it has no copy of.
 * Read after restorePodSession, which puts the query back.
 */
async function openRequested() {
	const params = new URLSearchParams(location.search);
	const id = params.get("open");
	if (!id) return;
	const address = { ...mapAddress(params), id };
	const store = address.store ? await storeById(address.store).catch(() => undefined) : undefined;
	const map = await store?.get(address.path, id).catch(() => undefined);
	history.replaceState(null, "", location.pathname);
	if (map && address.store) location.replace(mapUrl(address.store, address.path, id));
}

/**
 * With a Pod among the stores, the session is restored first: that may pass
 * through the identity provider and back, which is better now than when
 * someone opens the Pod in the explorer.
 */
async function restorePodSession() {
	if (navigator.onLine && appSettings().stores.some((s) => s.type === "solid")) await solidSession().catch(() => null);
}

resumeStores()
	.then((leaving) => (leaving ? new Promise<never>(() => {}) : restorePodSession()))
	.then(openRequested)
	.then(() => moveOldMaps())
	.catch(() => 0)
	.finally(showMaps)
	// Tests wait for this: logging in to a Pod may pass through its provider first.
	.finally(() => document.body.setAttribute("data-maps", "shown"));
registerServiceWorker();
