/**
 * The registered map views. A deployment registers only the views it
 * draws, so the others stay out of its bundle:
 *
 *   import { knowledgeMapView, registerView } from "@okmaps/ui-svelte";
 *   registerView(knowledgeMapView);
 *
 * registerCoreViews() (./core.ts) registers every view this package ships.
 * Registering a view also registers its type (the framework-free half) in
 * @okmaps/core, which processes the map and words the interface.
 */
import { type MapRecord, registerViewType, unregisterViewType } from "@okmaps/core";
import type { MapView } from "./types";

const views = new Map<string, MapView>();

/** Adds a view; registering the same id again replaces it. */
export function registerView(view: MapView): void {
	views.set(view.id, view);
	registerViewType(view);
}

export function unregisterView(id: string): void {
	views.delete(id);
	unregisterViewType(id);
}

/** The registered views, in the order they were first registered. */
export function mapViews(): MapView[] {
	return [...views.values()];
}

/** The view registered for this visType; throws when there is none. */
export function getView(id: string): MapView {
	const view = views.get(id);
	if (!view)
		throw new Error(
			`OKMaps: no view registered for visType "${id}". Register it with registerView() (or registerCoreViews()).`,
		);
	return view;
}

export function hasView(id: string): boolean {
	return views.has(id);
}

/** The registered views that can draw this record. */
export function viewsFor(record: MapRecord): MapView[] {
	return mapViews().filter((v) => v.accepts?.(record) ?? true);
}
