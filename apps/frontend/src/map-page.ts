/**
 * map.html?id=...      a map saved in this browser
 * map.html?shared=...  a published map (share link)
 *
 * The existing visualisation draws it, reading it in its local_files mode
 * from a blob URL. Add ui=new to see the new (Svelte) interface instead.
 */

import { registerServiceWorker } from "./offline.ts";
import { settings } from "./settings.ts";
import { domDecode, fetchSharedMap, neutralise, publishMap, type SharedMap, shareUrl } from "./share.ts";
import { getMap, readChoice, type SavedMap, saveMap, withoutPodLogin } from "./store.ts";
import { visConfig } from "./vis-config.ts";

declare global {
	interface Window {
		data_config?: Record<string, unknown>;
		headstart?: { start: (config?: Record<string, unknown>) => void };
	}
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Adds the visualisation's built scripts and styles (written by scripts/build-vis.mjs) in order. */
async function loadVis(): Promise<void> {
	const base = `${import.meta.env.BASE_URL}vis/`;
	const tags = (await (await fetch(`${base}tags.json`)).json()) as { scripts: string[]; styles: string[] };
	for (const href of tags.styles) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = base + href;
		document.head.append(link);
	}
	let last: Promise<unknown> = Promise.resolve();
	for (const src of tags.scripts) {
		const s = document.createElement("script");
		s.src = base + src;
		s.async = false;
		last = new Promise((resolve, reject) => {
			s.onload = resolve;
			s.onerror = () => reject(new Error(`could not load ${src}`));
		});
		document.body.append(s);
	}
	await last;
}

function showMessage(text: string) {
	const el = $("message");
	el.textContent = text;
	el.hidden = false;
}

/** The toolbar link that switches between the current and the new interface. */
function offerToggle(useNew: boolean) {
	const link = $<HTMLAnchorElement>("ui-toggle");
	const url = new URL(location.href);
	if (useNew) url.searchParams.delete("ui");
	else url.searchParams.set("ui", "new");
	link.href = url.href;
	link.textContent = useNew ? "Back to the current look" : "Preview the new look";
	link.hidden = false;
}

const useNew = new URLSearchParams(location.search).get("ui") === "new";

/**
 * Draws the map. `sharedId` gives the map's share link (publishing it on
 * first use), for the new interface's Share and Embed buttons.
 */
async function draw(map: SharedMap, sharedId?: () => Promise<string>) {
	document.title = `${map.title} - Open Knowledge Maps`;
	offerToggle(useNew);
	if (useNew) {
		const { drawNew } = await import("./svelte-map.ts");
		const shareLink = sharedId
			? async () => {
					const url = new URL(shareUrl(await sharedId()));
					url.searchParams.set("ui", "new");
					return url.href;
				}
			: undefined;
		return drawNew($("visualization"), map as unknown as Parameters<typeof drawNew>[1], { shareLink });
	}
	const body = JSON.stringify({ context: map.context, data: JSON.stringify(map.documents) });
	const file = URL.createObjectURL(new Blob([body], { type: "application/json" }));
	window.data_config = visConfig(map.context.service, { title: map.title, file });
	await loadVis();
	window.headstart!.start();
}

/** The map's share id, publishing it to the gateway the first time. */
async function publishOnce(saved: SavedMap): Promise<string> {
	if (saved.sharedId) return saved.sharedId;
	saved.sharedId = await publishMap(settings.gatewayUrl, saved);
	await saveMap(saved);
	return saved.sharedId;
}

/** Share button (current look): publishes the map once and shows its link. */
function offerShare(saved: SavedMap) {
	const button = $<HTMLButtonElement>("share");
	const panel = $("share-panel");
	const input = $<HTMLInputElement>("share-url");
	const show = (id: string) => {
		input.value = shareUrl(id);
		panel.hidden = false;
		input.select();
	};
	button.hidden = false;
	button.onclick = async () => {
		if (saved.sharedId) return show(saved.sharedId);
		button.disabled = true;
		button.textContent = "Sharing…";
		try {
			show(await publishOnce(saved));
		} catch (err) {
			showMessage(`The map could not be shared: ${err instanceof Error ? err.message : err}`);
		} finally {
			button.disabled = false;
			button.textContent = "Share";
		}
	};
	$<HTMLButtonElement>("copy").onclick = async () => {
		await navigator.clipboard?.writeText(input.value).catch(() => input.select());
		$("copy").textContent = "Copied";
	};
}

/** Save button on a shared map: keeps a copy in this browser. */
function offerSave(map: SharedMap, sharedId: string) {
	const button = $<HTMLButtonElement>("save");
	button.hidden = false;
	button.onclick = async () => {
		const id = crypto.randomUUID();
		await saveMap({
			...map,
			id,
			context: { ...map.context, id },
			created: new Date().toISOString(),
			request: requestOf(map),
			sharedId,
		});
		button.textContent = "Saved to your maps";
		button.disabled = true;
	};
}

/** The search a shared map came from, as far as its context tells. */
function requestOf(map: SharedMap): SavedMap["request"] {
	const p = JSON.parse(map.context.params || "{}");
	if (map.context.service === "openaire")
		return { service: "openaire", project_id: p.project_id ?? "", funder: p.funder ?? "" };
	const common = { q: map.context.query, from: p.from ?? "", to: p.to ?? "", sorting: p.sorting ?? "most-relevant" };
	return map.context.service === "base"
		? { service: "base", ...common, document_types: p.document_types ?? [] }
		: { service: "pubmed", ...common };
}

async function main() {
	const params = new URLSearchParams(location.search);
	const shared = params.get("shared");
	if (shared) {
		if (!settings.gatewayUrl) return showMessage("Share links need a gateway, and this site has none.");
		const map = await fetchSharedMap(settings.gatewayUrl, shared);
		if (!map) return showMessage("This shared map does not exist.");
		const safe = neutralise(map, domDecode);
		offerSave(safe, shared);
		return draw(safe, async () => shared);
	}
	const id = params.get("id");
	withoutPodLogin();
	const saved = id ? await getMap(id) : undefined;
	if (!saved && id && readChoice().kind === "solid") {
		// Not copied from the Pod yet: the main page logs in and fetches it.
		location.replace(`./?open=${encodeURIComponent(id)}`);
		return;
	}
	if (!saved) return showMessage("This map is not saved in this browser.");
	if (!settings.gatewayUrl) return draw(saved);
	// The new look has its own Share and Embed buttons.
	if (!useNew) offerShare(saved);
	return draw(saved, () => publishOnce(saved));
}

main().catch((err) => showMessage(`The map could not be shown: ${err instanceof Error ? err.message : err}`));
registerServiceWorker();
