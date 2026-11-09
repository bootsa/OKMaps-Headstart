/**
 * A map view: one way of drawing a map (knowledge map, streamgraph, geo
 * map, ...), covering both what the data needs (processing) and how it is
 * drawn (presentation). Views are registered (./registry.ts) and picked by
 * the map's `config.visType`, so shared code never names a view.
 *
 * The framework-free half (ViewType: processing, wording, flags) lives in
 * @okmaps/core; MapView adds the Svelte component and what the view
 * contributes to the interface around it.
 */

import type { ViewType } from "@okmaps/core";
import type { Component, Snippet } from "svelte";
import type { MapState } from "../data/state.svelte";

export interface ViewProps {
	state: MapState;
	/** Room for the view (px). */
	width: number;
	height: number;
}

/** One part of a map the list can jump to: an area, a stream, ... */
export interface MapSection {
	id: string;
	label: string;
	/** Resources in it that match the list's search and filter. */
	count: number;
}

/**
 * The parts of a map (knowledge map areas, streamgraph streams) the list
 * offers as shortcuts on the overview, so they can be reached without
 * the map, e.g. on a phone with the list drawer open.
 */
export interface ViewSections {
	/** Key of the string (i18n/strings.ts) that names them, e.g. "areas_label". */
	label: string;
	/** The parts, in the order the list shows them. */
	list(map: MapState): MapSection[];
	/** Zooms into or selects a part. */
	open(map: MapState, id: string): void;
	/** Lights up a part on the map while the pointer is over its shortcut (null when it leaves). */
	hover?(map: MapState, id: string | null): void;
}

/** A view type (@okmaps/core) with its Svelte drawing and what it adds to the interface. */
export interface MapView extends ViewType {
	// biome-ignore lint/suspicious/noExplicitAny: views take more props than ViewProps
	component: Component<ViewProps & Record<string, any>>;
	/** Runs once when the interface opens the map, e.g. to pick up a saved theme. */
	start?(map: MapState): void;
	/** Controls for the settings panel (the knowledge map's "Map style"). */
	settings?: Component<{ state: MapState }>[];
	/**
	 * How far up the overlays and settings button sit (CSS length), when
	 * the view draws something of its own at the bottom (the geo map's
	 * attribution).
	 */
	overlayInset?: string;
	/** Shortcuts in the list to the map's parts (areas, streams). */
	sections?: ViewSections;
	/** The view's part of the "More information" page; `source` is the data source part. */
	info?: Component<{ state: MapState; source?: Snippet }>;
}

export type { ProcessInput, ViewProcessor, ViewType } from "@okmaps/core";
