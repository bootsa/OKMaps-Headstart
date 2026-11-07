/**
 * The new (Svelte) interface, shown with map.html?ui=new while it is being
 * built next to the old one. It draws the knowledge map and its list so
 * far: no header, paper details or modals yet.
 */
import "@okmaps/ui-svelte/styles.css";
import { type MapRecord, MapState, registerCorePlugins, Visualization } from "@okmaps/ui-svelte";
import { mount } from "svelte";

// Every plugin the package ships: the app serves all kinds of maps.
registerCorePlugins();

export function drawNew(target: HTMLElement, record: MapRecord): void {
	target.classList.add("okmaps", "okm-page");
	const state = new MapState(record, 600);
	mount(Visualization, { target, props: { state } });
}
