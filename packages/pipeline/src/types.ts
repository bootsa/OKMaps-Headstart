/**
 * Input and output contracts of the pipeline.
 *
 * A Paper is one record from a source adaptor. Field names follow the JSON
 * the current frontend reads, so the output can be rendered without changes.
 */
export interface Paper {
	id: string;
	title: string | null;
	paper_abstract?: string | null;
	/** Keywords, "; "-separated. */
	subject?: string | null;
	/** Original keywords as delivered by the source (used for label casing). */
	subject_orig?: string | null;
	/** Languages, "; "-separated ISO 639-2 codes (BASE). */
	lang?: string | null;
	/** Any further metadata is passed through to the output unchanged. */
	[field: string]: unknown;
}

export interface MapInput {
	papers: Paper[];
	/**
	 * Text used for clustering, per paper id. Defaults to title + " " + abstract,
	 * which is what the data clients send as `content`.
	 */
	content?: Record<string, string>;
	/** Service name, recorded in the output only. */
	service?: string;
}

export interface MapOptions {
	/** Upper bound on the number of areas (R: MAX_CLUSTERS = 15). */
	maxClusters?: number;
	/** Taxonomy separator for subjects (the worker default is ";"). */
	taxonomySeparator?: string | null;
	/** Number of terms in an area title. */
	labelTerms?: number;
}

/** One paper on the map: the input fields plus position and area. */
export interface MapDocument extends Paper {
	x: number;
	y: number;
	/** Area title (same for all papers of an area). */
	area: string;
	/** Area number, 1-based, in order of first appearance of the title. */
	area_uri: number;
	/** Same as area (kept for the frontend). */
	cluster_labels: string;
	/** Paper id (kept for the frontend, which reads `labels`). */
	labels: string;
	subject_is_heuristic: boolean;
}

export interface MapResult {
	documents: MapDocument[];
	numAreas: number;
	/** Layout stress (lower is better). */
	stress: number;
}
