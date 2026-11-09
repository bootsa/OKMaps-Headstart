/**
 * map.html?store=...&path=...&id=...  a saved map (path: its folder; no store: the default one)
 * map.html?draft=...   a map made without saving it (src/drafts.ts)
 * map.html?shared=...  a published map (share link)
 *
 * The map is drawn by @okmaps/ui-svelte (svelte-map.ts).
 */

import type { MapStore } from "@okmaps/storage";
import { pageTitle } from "./app.ts";
import { deleteDraft, getDraft, saveDraft } from "./drafts.ts";
import { registerServiceWorker } from "./offline.ts";
import { settings } from "./settings.ts";
import { domDecode, fetchSharedMap, neutralise, publishMap, type SharedMap, shareUrl } from "./share.ts";
import {
	appSettings,
	findMap,
	mapAddress,
	mapUrl,
	type SavedMap,
	saveTarget,
	storeById,
	withoutPodLogin,
} from "./store.ts";
import { drawMap } from "./svelte-map.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function showMessage(text: string) {
	const el = $("message");
	el.textContent = text;
	el.hidden = false;
}

/**
 * Draws the map. `sharedId` gives the map's share link (publishing it on
 * first use), for the Share and Embed buttons.
 */
function draw(map: SharedMap, sharedId?: () => Promise<string>) {
	document.title = pageTitle(map.title);
	const shareLink = sharedId ? async () => shareUrl(await sharedId()) : undefined;
	drawMap($("visualization"), map as unknown as Parameters<typeof drawMap>[1], { shareLink });
}

/** The map's share id, publishing it to the gateway the first time. */
async function publishOnce(saved: SavedMap, store: MapStore<SavedMap>, path: string[]): Promise<string> {
	if (saved.sharedId) return saved.sharedId;
	saved.sharedId = await publishMap(settings.gatewayUrl, saved);
	await store.save(path, saved);
	return saved.sharedId;
}

/**
 * Save, for a shared map or a draft: a choice of store (and the folder new
 * maps go to) and a button. `saved` gets where it went.
 */
function offerSave(make: () => SavedMap, saved?: (store: string, path: string[], map: SavedMap) => void) {
	const sets = appSettings();
	if (!sets.stores.length) return;
	const select = $<HTMLSelectElement>("save-to");
	const button = $<HTMLButtonElement>("save");
	const target = saveTarget();
	const options = sets.stores.map((s) => ({ value: JSON.stringify([s.id]), label: s.name }));
	if (target?.path.length)
		options.unshift({
			value: JSON.stringify([target.store.id, ...target.path]),
			label: [target.store.name, ...target.path].join(" / "),
		});
	select.replaceChildren(...options.map((o) => new Option(o.label, o.value)));
	if (target && !target.path.length) select.value = JSON.stringify([target.store.id]);
	$("save-panel").hidden = false;
	button.onclick = async () => {
		const [store, ...path] = JSON.parse(select.value) as string[];
		const name = sets.store(store)?.name ?? store;
		button.disabled = true;
		select.disabled = true;
		try {
			const map = make();
			await (await storeById(store)).save(path, map);
			button.textContent = `Saved to ${[name, ...path].join(" / ")}`;
			saved?.(store, path, map);
		} catch (err) {
			showMessage(`The map could not be saved to ${name}: ${err instanceof Error ? err.message : err}`);
			button.disabled = false;
			select.disabled = false;
		}
	};
}

/** A copy of a shared map, to keep. */
function copyOf(map: SharedMap, sharedId: string): SavedMap {
	const id = crypto.randomUUID();
	return {
		...map,
		id,
		context: { ...map.context, id },
		created: new Date().toISOString(),
		request: requestOf(map),
		sharedId,
	};
}

/** The search a shared map came from, as far as its context tells. */
function requestOf(map: SharedMap): SavedMap["request"] {
	const p = JSON.parse(map.context.params || "{}");
	if (p.vis_type === "geomap")
		return { service: "places", source: p.source ?? map.context.service, title: p.custom_title ?? "" };
	if (map.context.service === "sparql" && p.sparql?.endpoint)
		return {
			service: "sparql",
			source: String(p.source ?? "SPARQL"),
			config: p.sparql,
			q: map.context.query,
			...(p.vis_type === "timeline" ? { vis_type: "timeline" as const } : {}),
		};
	if (map.context.service === "zenodo" && p.zenodo)
		return {
			service: "zenodo",
			source: String(p.source ?? "Zenodo"),
			config: p.zenodo,
			q: map.context.query,
			...(p.vis_type === "timeline" ? { vis_type: "timeline" as const } : {}),
		};
	if (map.context.service === "zotero" && p.zotero?.library)
		return {
			service: "zotero",
			source: String(p.source ?? "Zotero"),
			config: p.zotero,
			q: map.context.query ?? "",
			...(p.vis_type === "timeline" ? { vis_type: "timeline" as const } : {}),
		};
	if (map.context.service === "openalex" && p.openalex)
		return {
			service: "openalex",
			source: String(p.source ?? "OpenAlex"),
			// A shared copy names no source of this browser's: it runs without an API key.
			sourceId: "",
			config: p.openalex,
			q: map.context.query,
			from: p.from ?? "",
			to: p.to ?? "",
			sorting: p.sorting ?? "most-relevant",
			...(p.vis_type === "timeline" ? { vis_type: "timeline" as const } : {}),
		};
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
		offerSave(() => copyOf(safe, shared));
		return draw(safe, async () => shared);
	}
	const draftId = params.get("draft");
	if (draftId) {
		const draft = await getDraft(draftId);
		if (!draft) return showMessage("This map was not saved, and it is gone from this browser now.");
		const drafts = { save: async (_path: string[], m: SavedMap) => saveDraft(m) } as unknown as MapStore<SavedMap>;
		offerSave(
			() => draft,
			(store, path, map) => {
				// Saved: the page's address becomes the saved map's.
				history.replaceState(null, "", mapUrl(store, path, map.id));
				void deleteDraft(map.id);
			},
		);
		return draw(draft, settings.gatewayUrl ? () => publishOnce(draft, drafts, []) : undefined);
	}
	const address = mapAddress(params);
	withoutPodLogin();
	const found = await findMap(address);
	if (!found && address.id && address.store && appSettings().store(address.store)?.type === "solid") {
		// Not copied from the Pod yet: the main page logs in and fetches it.
		const back = new URLSearchParams(mapUrl(address.store, address.path, address.id).split("?")[1]);
		back.set("open", address.id);
		back.delete("id");
		location.replace(`./?${back}`);
		return;
	}
	if (!found) return showMessage("This map is not in any of your stores.");
	const { map, store, path } = found;
	return draw(map, settings.gatewayUrl ? () => publishOnce(map, store, path) : undefined);
}

// A message from the start page (e.g. the chosen store could not be written).
try {
	const left = sessionStorage.getItem("okmaps-message");
	if (left) {
		sessionStorage.removeItem("okmaps-message");
		showMessage(left);
	}
} catch {
	// no session storage: no message
}

main().catch((err) => showMessage(`The map could not be shown: ${err instanceof Error ? err.message : err}`));
registerServiceWorker();
