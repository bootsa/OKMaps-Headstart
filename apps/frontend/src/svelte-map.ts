/**
 * The new (Svelte) interface, shown with map.html?ui=new while it is being
 * built next to the old one: the whole page, with the page's toolbar in
 * its settings panel.
 */
import "@okmaps/ui-svelte/styles.css";
import {
	embedPlugin,
	type MapRecord,
	MapState,
	registerCorePlugins,
	registerPlugin,
	sharePlugin,
	Visualization,
} from "@okmaps/ui-svelte";
import { mount } from "svelte";

// Every plugin the package ships: the app serves all kinds of maps.
registerCorePlugins();

export interface DrawOptions {
	/** The map's share link; with it the map gets Share and Embed buttons. */
	shareLink?: () => Promise<string>;
}

export function drawNew(target: HTMLElement, record: MapRecord, options: DrawOptions = {}): void {
	const embedded = new URLSearchParams(location.search).get("embed") === "true";
	if (options.shareLink && !embedded) {
		registerPlugin(sharePlugin({ link: options.shareLink, hashtags: "okmaps,openscience,dataviz" }));
		registerPlugin(embedPlugin({ link: options.shareLink }));
	}
	document.body.classList.add("okm-new");
	document.body.classList.toggle("okm-embedded", embedded);
	target.classList.add("okmaps", "okm-page");
	target.style.removeProperty("background-color");
	const state = new MapState(record, 600);
	// The page's own links (share, save, back to search) go in the settings
	// panel; an embedded map shows none of them.
	const menu = embedded ? null : document.querySelector<HTMLElement>(".toolbar");
	mount(Visualization, { target, props: { state, menu } });
}
