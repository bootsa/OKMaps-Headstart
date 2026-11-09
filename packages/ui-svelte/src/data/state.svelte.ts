/**
 * The interface state of one map (@okmaps/core's MapState: zoom, selection,
 * list search, filter and sort, ...) made reactive for Svelte, with the
 * view narrowed to the registered Svelte view. Components read its fields
 * directly and call its methods.
 */
import { MapState as CoreMapState, type MapFields } from "@okmaps/core";
import { getView } from "../views/registry";
import type { MapView } from "../views/types";
import { track } from "./reactive";

export class MapState extends CoreMapState {
	protected override observe(field: keyof MapFields): void {
		track(this, field);
	}

	/** The view that draws this map (config.visType; see ../views). */
	override get view(): MapView {
		return getView(this.config.visType);
	}
}
