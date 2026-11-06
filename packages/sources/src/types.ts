/**
 * What every source adaptor returns. The shape matches the input of
 * @okmaps/pipeline (MapInput), so a result can go straight into
 * buildOverviewMap.
 */
export interface SourceRecord {
	/** Unique within one result (PubMed: the PMID). */
	id: string;
	title: string | null;
	paper_abstract: string | null;
	/** Keywords, "; "-separated. */
	subject: string | null;
	/** Keywords as delivered by the provider (used for label casing). */
	subject_orig: string | null;
	authors: string;
	year: string | null;
	published_in: string | null;
	url: string;
	doi: string;
	/** Further provider-specific fields, kept for the frontend. */
	[field: string]: unknown;
}

export interface SourceResult {
	service: string;
	papers: SourceRecord[];
	/** Text used for clustering, per record id. */
	content: Record<string, string>;
	/** The query as sent to the provider, for display and debugging. */
	query: string;
}
