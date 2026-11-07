/**
 * A map view: one way of drawing a map (knowledge map, streamgraph, geo
 * map, ...), covering both what the data needs (processing) and how it is
 * drawn (presentation). Views are registered (./registry.ts) and picked by
 * the map's `config.visType`, so shared code never names a view.
 *
 * The processing half (ViewProcessor) imports no Svelte, so it can move
 * into the frontend-agnostic pipeline later; the presentation half adds
 * the component and what the view contributes to the interface around it.
 */
import type { Component } from "svelte";
import type { MapConfig } from "../data/config";
import type { MapState } from "../data/state.svelte";
import type { MapRecord, Paper, ProcessedMap } from "../data/types";

export interface ProcessInput {
	record: MapRecord;
	/** The record's documents, already made into papers (data/papers.ts). */
	papers: Paper[];
	/** Chart size (px) the coordinates are for. */
	size: number;
	config: MapConfig;
}

/** The view's data shaping: record in, what the component draws out. */
export interface ViewProcessor {
	/** The map's `config.visType` this view draws ("overview", "timeline", "geomap", ...). */
	id: string;
	/**
	 * Whether a record carries what this view needs (a streamgraph needs
	 * keyword counts per year, a geo map places). Not checked when a map
	 * names its view; it lets a page offer only the views a record fits.
	 */
	accepts?(record: MapRecord): boolean;
	/** Places, groups or counts the papers. Runs again when the map is rescaled. */
	process(input: ProcessInput): ProcessedMap;
	/** A layout pass after `process` (the knowledge map's force layout). */
	layout?(map: ProcessedMap, config: MapConfig): void;
}

export interface ViewProps {
	state: MapState;
	/** Room for the view (px). */
	width: number;
	height: number;
}

export interface MapView extends ViewProcessor {
	/** Shown to people, e.g. "Knowledge map". */
	label: string;
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
	/** Selecting a paper zooms into its area (views that have areas). */
	zoomsToArea?: boolean;
}
