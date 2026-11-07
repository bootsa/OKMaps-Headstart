/**
 * map.html?store=...&path=...&id=...  a saved map (path: its folder; no store: the default one)
 * map.html?shared=...  a published map (share link)
 *
 * The map is drawn by @okmaps/ui-svelte (svelte-map.ts).
 */

import type { MapStore } from "@okmaps/storage";
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
	document.title = `${map.title} - Open Knowledge Maps`;
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

/** Save button on a shared map: keeps a copy where new maps are saved. */
function offerSave(map: SharedMap, sharedId: string) {
	const button = $<HTMLButtonElement>("save");
	const target = saveTarget();
	if (!target) return;
	button.hidden = false;
	button.onclick = async () => {
		const id = crypto.randomUUID();
		const store = await storeById(target.store.id);
		await store.save(target.path, {
			...map,
			id,
			context: { ...map.context, id },
			created: new Date().toISOString(),
			request: requestOf(map),
			sharedId,
		});
		button.textContent = `Saved to ${target.store.name}`;
		button.disabled = true;
	};
}

/** The search a shared map came from, as far as its context tells. */
function requestOf(map: SharedMap): SavedMap["request"] {
	const p = JSON.parse(map.context.params || "{}");
	if (p.vis_type === "geomap")
		return { service: "places", source: p.source ?? map.context.service, title: p.custom_title ?? "" };
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

main().catch((err) => showMessage(`The map could not be shown: ${err instanceof Error ? err.message : err}`));
registerServiceWorker();
