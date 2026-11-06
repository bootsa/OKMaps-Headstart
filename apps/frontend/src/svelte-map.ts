/**
 * The new (Svelte) interface, shown with map.html?ui=new while it is being
 * built next to the old one. It draws the knowledge map only so far: no
 * list, header or paper details yet.
 */
import "@okmaps/ui-svelte/styles.css";
import { KnowledgeMap, type MapRecord, MapState } from "@okmaps/ui-svelte";
import { mount } from "svelte";

export function drawNew(target: HTMLElement, record: MapRecord): void {
	target.classList.add("okmaps");
	const chartSize = () => Math.max(300, Math.min(target.clientWidth || innerWidth, innerHeight - 24));
	const state = new MapState(record, chartSize());
	mount(KnowledgeMap, { target, props: { state } });
	let frame = 0;
	addEventListener("resize", () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => state.resize(chartSize()));
	});
}
