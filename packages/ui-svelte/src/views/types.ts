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
import type { Component, Snippet } from "svelte";
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
	/**
	 * The view draws the papers' areas: selecting a paper zooms into its
	 * area, and list entries name their area.
	 */
	areas?: boolean;
	/** List entries show a place instead of authors; hovering one lights up its pin. */
	places?: boolean;
	/**
	 * The view shows resources over time: the resource count is not capped
	 * at the search's 100, and "most recent" maps give only an end date.
	 */
	overTime?: boolean;
	/** The search on the start page can make maps of this view (the credit's "Create a map" button). */
	creatable?: boolean;
	/** Keys of strings (i18n/strings.ts) for the view's wording. */
	strings: {
		/** "Knowledge Map of", before the query in the title. */
		heading: string;
		/** The heading of a map of one person's works. */
		authorHeading?: string;
		/** The list's button back from a selected paper. */
		backlink: string;
		/** Explains "most relevant resources" in the context line (default most_relevant_tooltip). */
		mostRelevantTooltip?: string;
		/** Explains the time span in the context line (none by default). */
		timespanTooltip?: string;
	};
	/** How "Cite this map" names the view. */
	citation: {
		/** Picks the strings cite_title_<kind> and cite_vis_<kind>. */
		kind: string;
		/** Fills ${type} in the citation template, e.g. "Knowledge Map". */
		type: string;
		/** A citation of its own instead of the template. */
		text?(query: string, year: number, link: string): string;
	};
	/** The view's part of the "More information" page; `source` is the data source part. */
	info?: Component<{ state: MapState; source?: Snippet }>;
}
