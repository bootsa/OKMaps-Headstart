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
import type { ContextItem, MapTitle } from "../header/context";

/** A button in the map's toolbar (next to the title). */
export interface MapAction {
	id: string;
	label: string;
	/** Tooltip. */
	title?: string;
	/** Hidden when this returns false. */
	show?(map: MapState): boolean;
	/** A link to open in a new tab instead of running `run`. */
	href?(map: MapState): string;
	run?(map: MapState): void;
}

/** Something drawn over the map, e.g. a notice that an update is available. */
export interface Overlay {
	// biome-ignore lint/suspicious/noExplicitAny: each overlay takes its own props
	component: Component<any>;
	/** Passed to the component along with `state`. */
	props?: Record<string, unknown>;
}

/** A button under a paper in the list ("PDF", "Cite as", "Export"). */
export interface PaperAction {
	id: string;
	label: string;
	/** Tooltip. */
	title?: string;
	/** Drawn as the main button. */
	primary?: boolean;
	show?(map: MapState, paper: Paper): boolean;
	/** A link to open in a new tab instead of running `run`. */
	href?(map: MapState, paper: Paper): string;
	run?(map: MapState, paper: Paper): void;
}

/** A number shown under a paper in the list, e.g. "12 citations". */
export interface PaperMetric {
	id: string;
	value: number | "n/a";
	label: string;
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
	// biome-ignore lint/suspicious/noExplicitAny: each page takes its own props
	component: Component<any>;
	/** Passed to the component along with `state`. */
	props?: Record<string, unknown>;
}

export interface OkmPlugin {
	/** Unique name; registering the same id again replaces the plugin. */
	id: string;
	/** The map's title instead of the usual one; the first plugin with one wins. */
	title?(map: MapState): MapTitle | null | undefined;
	/** Items added to the end of the context line. */
	contextItems?(map: MapState): ContextItem[];
	actions?: MapAction[];
	paperActions?: PaperAction[];
	/** Numbers shown under each paper in the list, in place of its readers. */
	paperMetrics?(map: MapState, paper: Paper): PaperMetric[];
	/** Modals by id; map.openModal(id, data) shows one. */
	modals?: Record<string, { title(map: MapState, data: unknown): string; component: Component<ModalProps<never>> }>;
	infoPages?: InfoPage[];
	overlays?: Overlay[];
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

/** The paper buttons the plugins offer for this paper. */
export function paperActions(map: MapState, paper: Paper): PaperAction[] {
	return activePlugins()
		.flatMap((p) => p.paperActions ?? [])
		.filter((a) => a.show?.(map, paper) ?? true);
}

/** A plugin's title for the map, if one has it. */
export function pluginTitle(map: MapState): MapTitle | undefined {
	for (const p of plugins.values()) {
		const title = p.title?.(map);
		if (title) return title;
	}
	return undefined;
}

/** The metrics the plugins show for this paper. */
export function paperMetrics(map: MapState, paper: Paper): PaperMetric[] {
	return activePlugins().flatMap((p) => p.paperMetrics?.(map, paper) ?? []);
}

/** The best info page for this map, if any plugin has one. */
export function findInfoPage(map: MapState): InfoPage | undefined {
	return activePlugins()
		.flatMap((p) => p.infoPages ?? [])
		.filter((page) => page.matches(map))
		.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}
