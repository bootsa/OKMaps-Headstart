/**
 * Draws a map with @okmaps/ui-svelte: the whole page, with the page's
 * toolbar in its settings panel.
 */
import "@okmaps/ui-svelte/styles.css";
import {
	creditPlugin,
	embedPlugin,
	type MapRecord,
	MapState,
	registerCorePlugins,
	registerCoreViews,
	registerPlugin,
	sharePlugin,
	Visualization,
} from "@okmaps/ui-svelte";
import { mount } from "svelte";

// Every view and plugin the package ships: the app serves all kinds of maps.
registerCoreViews();
registerCorePlugins();

export interface DrawOptions {
	/** The map's share link; with it the map gets Share and Embed buttons. */
	shareLink?: () => Promise<string>;
}

export function drawMap(target: HTMLElement, record: MapRecord, options: DrawOptions = {}): void {
	const embedded = new URLSearchParams(location.search).get("embed") === "true";
	if (options.shareLink && !embedded) {
		registerPlugin(sharePlugin({ link: options.shareLink, hashtags: "okmaps,openscience,dataviz" }));
		registerPlugin(embedPlugin({ link: options.shareLink }));
	}
	registerPlugin(
		creditPlugin({
			faqs: "https://openknowledgemaps.org/faq",
			create: embedded ? undefined : new URL("./", location.href).href,
			link: options.shareLink,
		}),
	);
	document.body.classList.toggle("okm-embedded", embedded);
	target.classList.add("okmaps", "okm-page");
	const state = new MapState(record, 600);
	// The page's own links (share, save, back to search) go in the settings
	// panel; an embedded map shows none of them.
	const menu = embedded ? null : document.querySelector<HTMLElement>(".toolbar");
	mount(Visualization, { target, props: { state, menu } });
}
