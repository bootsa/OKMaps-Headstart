/**
 * A view type: the framework-free half of a map view (knowledge map,
 * streamgraph, geo map, ...). It says what the data needs (processing) and
 * how the interface around the map talks about it (wording, citation,
 * flags), but not how it is drawn. A UI layer (ui-svelte's MapView, or a
 * renderer of your own in any framework) adds the drawing.
 *
 * View types are registered (./registry.ts) and picked by the map's
 * `config.visType`, so shared code never names a view.
 */
import type { MapConfig } from "../data/config";
import type { MapRecord, Paper, ProcessedMap } from "../data/types";

export interface ProcessInput {
	record: MapRecord;
	/** The record's documents, already made into papers (data/papers.ts). */
	papers: Paper[];
	/** Chart size (px) the coordinates are for. */
	size: number;
	config: MapConfig;
}

/** The view's data shaping: record in, what the renderer draws out. */
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

/** Everything about a view except how it is drawn. */
export interface ViewType extends ViewProcessor {
	/** Shown to people, e.g. "Knowledge map". */
	label: string;
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
}
