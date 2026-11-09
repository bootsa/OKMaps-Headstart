/**
 * The registered view types. A UI layer registers the views it draws
 * (ui-svelte's registerView does this for you), or a page that draws maps
 * itself registers just the types:
 *
 *   import { knowledgeMapType, registerViewType } from "@okmaps/core";
 *   registerViewType(knowledgeMapType);
 *
 * registerCoreViewTypes() (./core.ts) registers every type this package ships.
 */
import type { MapRecord } from "../data/types";
import type { ViewType } from "./types";

const types = new Map<string, ViewType>();

/** Adds a view type; registering the same id again replaces it. */
export function registerViewType(type: ViewType): void {
	types.set(type.id, type);
}

export function unregisterViewType(id: string): void {
	types.delete(id);
}

/** The registered view types, in the order they were first registered. */
export function viewTypes(): ViewType[] {
	return [...types.values()];
}

/** The view type registered for this visType; throws when there is none. */
export function getViewType(id: string): ViewType {
	const type = types.get(id);
	if (!type)
		throw new Error(
			`OKMaps: no view registered for visType "${id}". Register it with registerView() or registerViewType() (or the core ones).`,
		);
	return type;
}

export function hasViewType(id: string): boolean {
	return types.has(id);
}

/** The registered view types that can draw this record. */
export function viewTypesFor(record: MapRecord): ViewType[] {
	return viewTypes().filter((v) => v.accepts?.(record) ?? true);
}
