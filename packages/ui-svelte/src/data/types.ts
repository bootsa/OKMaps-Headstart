/** What the views draw: the map's papers and areas after processing. */

/** A map as the app keeps it: the pipeline's documents plus the search context. */
export interface MapRecord {
	context: MapContext;
	documents: RawDocument[];
	/** Keyword counts per year, for streamgraphs. */
	streamgraph?: StreamgraphData | string | null;
}

export interface MapContext {
	service?: string;
	query?: string;
	params?: Record<string, unknown> | string;
	num_documents?: number;
	[field: string]: unknown;
}

/** A document as the pipeline writes it; providers add their own fields. */
export type RawDocument = Record<string, unknown>;

export interface Author {
	firstName?: string;
	lastName: string;
}

export interface Comment {
	comment: string;
	author?: string;
}

export interface Link {
	address: string;
	isDoi: boolean;
}

/** Where a facility is (AQUANAVI's coverage field), for the geo map. */
export interface Place {
	country: string | null;
	continent: string | null;
	/** Longitude. */
	east: number | null;
	/** Latitude. */
	north: number | null;
}

export interface Paper {
	id: string;
	/** id with every character outside [A-Za-z0-9] escaped, safe in a DOM id. */
	safeId: string;
	identifier: string;
	title: string;
	authors: Author[];
	/** "First Last" (or "Last First"), at most 20 plus the last one. */
	authorsList: string[];
	authorsString: string;
	abstract: string;
	year: string;
	publishedIn: string;
	/** "; "-separated keywords as the source gave them. */
	keywords: string;
	resultType: string[];
	comments: Comment[];
	tags: string[];
	doi: string;
	url: string;
	oaState: number;
	/** Open access (PubMed: has a PMC id). */
	oa: boolean;
	/** Free to read but not open access (oa_state 3). */
	freeAccess: boolean;
	oaLink: string;
	outlink: string;
	listLink: Link | null;
	relevance: number;
	/** Shown metrics; "n/a" when the source has none. */
	readers: number;
	citations: number | "n/a";
	/** Size metric (readers + 1, or 1 for content-based maps). */
	internalReaders: number;
	areaUri: string;
	area: string;
	/** Position and size on the map, in px for the current chart size. */
	x: number;
	y: number;
	diameter: number;
	width: number;
	height: number;
	/** Location for the geo map (AQUANAVI), or null. */
	place: Place | null;
	/** Every other field of the document, untouched. */
	raw: RawDocument;
}

export interface Area {
	uri: string;
	title: string;
	papers: Paper[];
	/** Sum of the papers' size metric. */
	readers: number;
	/** Position and radius in px for the current chart size. */
	x: number;
	y: number;
	r: number;
}

/** A streamgraph's input: keyword counts per year (the pipeline's "streamgraph" output). */
export interface StreamgraphData {
	x: string[];
	subject: Array<{ name: string; y: number[]; ids_overall: string[] }>;
}

/** One keyword stream, stacked (silhouette) and ready to draw. */
export interface Stream {
	key: string;
	/** Ids of the papers with this keyword. */
	docIds: string[];
	points: Array<{ date: Date; value: number; y0: number; y1: number }>;
}

export interface ProcessedMap {
	context: MapContext;
	papers: Paper[];
	areas: Area[];
	/** Streamgraph streams (timeline maps only). */
	streams: Stream[];
	/** Chart size (px) the coordinates are for. */
	size: number;
}
