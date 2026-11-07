/**
 * Plugins: optional parts of the interface, such as one integration's
 * context items, buttons or modals. A deployment imports and registers only
 * the plugins it needs, so the others stay out of its bundle.
 *
 *   import { registerPlugin } from "@okmaps/ui-svelte";
 *   registerPlugin(myPlugin);
 */
import type { MapState } from "../data/state.svelte";
import type { ContextItem } from "../header/context";

export interface OkmPlugin {
	/** Unique name; registering the same id again replaces the plugin. */
	id: string;
	/** Items added to the end of the context line. */
	contextItems?(map: MapState): ContextItem[];
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
