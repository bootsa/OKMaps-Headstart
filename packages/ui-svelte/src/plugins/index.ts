/**
 * Plugins: optional parts of the interface, such as one integration's
 * context items, buttons, modals or info page. A deployment imports and
 * registers only the plugins it needs, so the others stay out of its
 * bundle. The ones this package ships are in ./core
 * (registerCorePlugins registers them all).
 *
 *   import { registerPlugin } from "@okmaps/ui-svelte";
 *   registerPlugin(myPlugin);
 */
import type { Component } from "svelte";
import type { MapState } from "../data/state.svelte";
import type { Paper } from "../data/types";
import type { ContextItem } from "../header/context";

/** A button in the map's toolbar (next to the title). */
export interface MapAction {
	id: string;
	label: string;
	/** Hidden when this returns false. */
	show?(map: MapState): boolean;
	run(map: MapState): void;
}

/** A button on a list entry. */
export interface PaperAction {
	id: string;
	label: string;
	show?(map: MapState, paper: Paper): boolean;
	run(map: MapState, paper: Paper): void;
}

export interface ModalProps<T = unknown> {
	state: MapState;
	/** What the modal was opened with (map.openModal(id, data)). */
	data: T;
}

/** The "More information" page for some maps (by service, view, ...). */
export interface InfoPage {
	/** Higher wins when several pages match. */
	priority?: number;
	matches(map: MapState): boolean;
	/** The page's body; the modal adds the title and close button. */
	component: Component<{ state: MapState }>;
}

export interface OkmPlugin {
	/** Unique name; registering the same id again replaces the plugin. */
	id: string;
	/** Items added to the end of the context line. */
	contextItems?(map: MapState): ContextItem[];
	actions?: MapAction[];
	paperActions?: PaperAction[];
	/** Modals by id; map.openModal(id, data) shows one. */
	modals?: Record<string, { title(map: MapState, data: unknown): string; component: Component<ModalProps<never>> }>;
	infoPages?: InfoPage[];
}

const plugins = new Map<string, OkmPlugin>();

export function registerPlugin(plugin: OkmPlugin): void {
	plugins.set(plugin.id, plugin);
}

export function unregisterPlugin(id: string): void {
	plugins.delete(id);
}

/** The registered plugins, in the order they were first registered. */
export function activePlugins(): OkmPlugin[] {
	return [...plugins.values()];
}

export function findModal(id: string) {
	for (const p of plugins.values()) if (p.modals?.[id]) return p.modals[id];
	return undefined;
}

/** The best info page for this map, if any plugin has one. */
export function findInfoPage(map: MapState): InfoPage | undefined {
	return activePlugins()
		.flatMap((p) => p.infoPages ?? [])
		.filter((page) => page.matches(map))
		.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}
