/**
 * The new (Svelte) interface, shown with map.html?ui=new while it is being
 * built next to the old one: the whole page, with the page's toolbar in
 * its settings panel.
 */
import "@okmaps/ui-svelte/styles.css";
import { type MapRecord, MapState, registerCorePlugins, Visualization } from "@okmaps/ui-svelte";
import { mount } from "svelte";

// Every plugin the package ships: the app serves all kinds of maps.
registerCorePlugins();

export function drawNew(target: HTMLElement, record: MapRecord): void {
	document.body.classList.add("okm-new");
	target.classList.add("okmaps", "okm-page");
	target.style.removeProperty("background-color");
	const state = new MapState(record, 600);
	// The page's own links (share, save, back to search) go in the settings panel.
	const menu = document.querySelector<HTMLElement>(".toolbar");
	mount(Visualization, { target, props: { state, menu } });
}
