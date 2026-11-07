/**
 * index.html: the search form and the maps saved in this browser.
 */

import "@okmaps/ui-svelte/styles.css";
import { MapExplorer, mapStoreTypes } from "@okmaps/ui-svelte";
import { mount } from "svelte";
import { errorMessage } from "./messages.ts";
import { registerServiceWorker } from "./offline.ts";
import { placeSettings } from "./places.ts";
import type { MapRecord, SearchRequest, Service, Stage } from "./search.ts";
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
	saveTarget,
	storeById,
} from "./store.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("search");
const status = $<HTMLParagraphElement>("status");
const submit = $<HTMLButtonElement>("submit");

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
	...Object.fromEntries(places.map((p) => [p.id, p.label])),
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

const today = new Date().toISOString().slice(0, 10);
$<HTMLInputElement>("to").value = today;

// A source choice per place source; its value is "place:<id>".
{
	const fieldset = form.querySelector("fieldset.services")!;
	for (const p of places) {
		const label = document.createElement("label");
		const input = Object.assign(document.createElement("input"), {
			type: "radio",
			name: "service",
			value: `place:${p.id}`,
		});
		label.append(input, ` ${p.label}`);
		fieldset.append(label);
	}
}

// Only the sources switched on in the settings (and usable here) are offered.
registerAppSources();
{
	const sets = appSettings();
	const radios = [...form.querySelectorAll<HTMLInputElement>('input[name="service"]')];
	for (const r of radios) {
		const off = !sets.sourceEnabled(r.value);
		r.disabled = off;
		r.parentElement!.hidden = off;
	}
	const usable = radios.filter((r) => !r.disabled && !(r.value === "base" && !settings.gatewayUrl));
	if (!usable.some((r) => r.checked) && usable[0]) usable[0].checked = true;
	if (!usable.length) {
		submit.disabled = true;
		status.textContent = "Every source is switched off. Switch one on in the settings.";
	}
}

const choice = () => String(new FormData(form).get("service") ?? "pubmed");

function currentService(): Service {
	const c = choice();
	return c.startsWith("place:") ? "places" : (c as Service);
}

/** Shows the fields of the chosen service and its default start date. */
function updateFields() {
	const service = currentService();
	for (const el of form.querySelectorAll<HTMLElement>("[data-services]")) {
		const on = el.dataset.services!.split(" ").includes(service);
		el.hidden = !on;
		for (const input of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))
			input.disabled = !on;
	}
	const from = $<HTMLInputElement>("from");
	if (!from.dataset.touched) from.value = service === "base" ? "1665-01-01" : "1809-01-01";
}
form.addEventListener("change", (e) => {
	if ((e.target as HTMLElement).id === "from") $<HTMLInputElement>("from").dataset.touched = "1";
	if ((e.target as HTMLInputElement).name === "service") updateFields();
});
// BASE needs the gateway (registered IP and API key).
if (!settings.gatewayUrl) {
	const base = form.querySelector<HTMLInputElement>('input[name="service"][value="base"]')!;
	base.disabled = true;
	base.parentElement!.append(" (needs a gateway)");
}
updateFields();

function readRequest(): SearchRequest {
	const f = new FormData(form);
	const s = (k: string) => String(f.get(k) ?? "").trim();
	const service = currentService();
	if (service === "openaire") return { service, project_id: s("project_id"), funder: s("funder") };
	if (service === "places") return { service, source: choice().slice("place:".length), title: s("place_title") };
	const common = {
		q: s("q"),
		from: s("from"),
		to: s("to"),
		sorting: s("sorting") as "most-relevant" | "most-recent",
	};
	const vis_type = s("vis_type") === "timeline" ? ("timeline" as const) : undefined;
	const withView = vis_type ? { ...common, vis_type } : common;
	if (service === "base") return { service, ...withView, document_types: f.getAll("document_types").map(String) };
	return { service, ...withView };
}

function titleOf(req: SearchRequest): string {
	if (req.service === "openaire") return `Project ${req.project_id} (${req.funder})`;
	if (req.service === "places") {
		const p = places.find((x) => x.id === req.source);
		return req.title || p?.title || p?.label || req.source;
	}
	return req.q;
}

function runWorker(request: SearchRequest): Promise<MapRecord> {
	const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
	return new Promise<MapRecord>((resolve, reject) => {
		worker.onmessage = (e) => {
			const msg = e.data;
			if (msg.type === "stage") status.textContent = STAGES[msg.stage as Stage];
			else if (msg.type === "done") resolve(msg.map);
			else if (msg.type === "error") reject(Object.assign(new Error(msg.message), { reasons: msg.reasons }));
		};
		worker.onerror = (e) => reject(new Error(e.message));
		worker.postMessage({ request, settings: { ...settings, places } });
	}).finally(() => worker.terminate());
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	const request = readRequest();
	submit.disabled = true;
	status.className = "status";
	status.textContent = STAGES.searching;
	try {
		const target = saveTarget();
		if (!target) throw new Error("there is nowhere to keep it; add a place in the settings");
		const map = await runWorker(request);
		const id = map.context.id;
		const store = await storeById(target.store.id);
		await store.save(target.path, { ...map, id, created: new Date().toISOString(), request, title: titleOf(request) });
		void requestPersistence();
		location.href = mapUrl(target.store.id, target.path, id);
	} catch (err) {
		const reasons = (err as { reasons?: string[] }).reasons ?? [];
		status.className = "status error";
		status.textContent = errorMessage(reasons, err instanceof Error ? err.message : String(err));
		submit.disabled = false;
	}
});

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
