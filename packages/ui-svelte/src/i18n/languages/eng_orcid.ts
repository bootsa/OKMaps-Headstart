import type { Strings } from "../strings";

/** English, for ORCID researcher maps: the old map's "eng_orcid" strings, over eng. */
export const engOrcid: Strings = {
	loading: "Loading knowledge map.",
	relevance: "relevance",
	readers: "citations",
	year: "year",
	intro_label: "About the map",
	authors: "authors",
	title: "title",
	backlink: "← Back to overview",
	backlink_list: "Show all resources in area",
	backlink_list_streamgraph: "Show all resources",
	backlink_list_streamgraph_stream_selected: "Show all resources in stream",
	unknown: "Unknown",
	streamgraph_label: "Streamgraph of",
	overview_authors_label: "Knowledge map for the works of",
	streamgraph_authors_label: "Streamgraph for the works of",
	custom_title_explanation: "This is a custom title. Please see the info button for more information. Original query:",
	most_relevant_tooltip:
		"To determine the most relevant resources, we use the relevance ranking provided by the data source e.g. BASE. Data sources mainly use text similarity between your query and the article metadata to determine the relevance ranking. Please consult the FAQs for more information.",
	documenttypes_label: "Resource types",
	all: "any",
	open_access: "Open Access",
	items: "items",
	high_metadata_quality: "Data quality",
	high_metadata_quality_desc_base:
		"This visualization only includes resources with an abstract (min. 300 characters). High metadata quality significantly improves the quality of your visualization.",
	high_metadata_quality_desc_pubmed:
		"This visualization only includes resources with an abstract. High metadata quality significantly improves the quality of your visualization.",
	low_metadata_quality: "Data quality",
	low_metadata_quality_desc_base:
		"This visualization includes resources with and without an abstract. Low metadata quality may significantly reduce the quality of your visualization. ",
	low_metadata_quality_desc_pubmed:
		"This visualization includes resources with and without an abstract. Low metadata quality may significantly reduce the quality of your visualization. ",
	time_frame_context_sg:
		"Please note that we remove time intervals with only a few associated resources during the computation of your streamgraph to increase its readability. As a result the time on the x-axis may not align with the time range you selected.",
	// metrics
	citations_count_label: "citations",
	social_media_count_label: "social media mentions",
	references_count_label: "references outside academia",
	citations: "citations",
	social: "social media mentions",
	references: "references outside academia",
	metrics_label: "Metrics",
	researcher_details_label: "Researcher details",
	scale_by_explanation: "The size of the bubbles is relative to the number of resources related to them.",
	scale_label: {
		"content_based": "Documents",
		"citations": "Citations",
		"cited_by_accounts_count": "Social media mentions",
		"references": "References outside academia",
		"citation_count": "Citations",
		"cited_by_tweeters_count": "Tweets",
		"readers.mendeley": "Readers",
	},
};
