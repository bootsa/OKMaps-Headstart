/**
 * map.html?id=...      a map saved in this browser
 * map.html?shared=...  a published map (share link)
 *
 * The map is drawn by @okmaps/ui-svelte (svelte-map.ts).
 */

import { registerServiceWorker } from "./offline.ts";
import { settings } from "./settings.ts";
import { domDecode, fetchSharedMap, neutralise, publishMap, type SharedMap, shareUrl } from "./share.ts";
import { getMap, readChoice, type SavedMap, saveMap, withoutPodLogin } from "./store.ts";
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
async function publishOnce(saved: SavedMap): Promise<string> {
	if (saved.sharedId) return saved.sharedId;
	saved.sharedId = await publishMap(settings.gatewayUrl, saved);
	await saveMap(saved);
	return saved.sharedId;
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
	return draw(saved, settings.gatewayUrl ? () => publishOnce(saved) : undefined);
}

main().catch((err) => showMessage(`The map could not be shown: ${err instanceof Error ? err.message : err}`));
registerServiceWorker();
