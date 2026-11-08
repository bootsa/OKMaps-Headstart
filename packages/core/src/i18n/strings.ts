// English interface strings, from the old visualisation's localization.ts
// (eng plus the pubmed and openaire variants the app uses). A service's
// strings are layered over eng.

export type Strings = Record<string, string | Record<string, string>>;

const languages = {
	eng: {
		loading: "Loading...",
		noDataAvailable: "No data available",
		showMore: "Show more",
		showLess: "Show less",
		search_placeholder: "Search within visualization...",
		// Filter and sort labels (the old eng strings had none, so BASE maps showed the keys).
		relevance: "relevance",
		all: "any",
		open_access: "Open Access",
		publication: "papers",
		dataset: "datasets",
		intro_label: "More information",
		readers: "readers",
		year: "date",
		authors: "authors",
		title: "title",
		default_title: 'Overview of <span id="num_articles"></span> documents',
		// default_title as plain text (the old map filled in the span).
		default_title_text: "Overview of documents",
		timestamp_label: "Last updated",
		overview_label: "Knowledge Map of",
		streamgraph_label: "Streamgraph of",
		overview_authors_label: "Knowledge Map of the works of",
		streamgraph_authors_label: "Streamgraph of the works of",
		geomap_label: "Geo Map of",
		custom_title_explanation:
			"This is a custom title. Please see the info button for more information. Original query:",
		articles_label: "resources",
		most_recent_label: "most recent",
		most_relevant_label: "most relevant",
		most_relevant_tooltip:
			"At the moment, we use the relevance ranking provided by the source API. Both PubMed and BASE mainly use text similarity between your query and the article metadata to determine the relevance. Please consult the FAQ for more information.",
		most_relevant_tooltip_sg:
			"In this streamgraph you find the most relevant resources matching your query related to the top keywords. To determine the most relevant resources, we use the relevance ranking provided by the data source e.g. BASE. Data sources mainly use text similarity between your query and the article metadata to determine the relevance ranking. Please consult the FAQs for more information.",
		source_label: "Data source",
		resulttype_label: "Document type",
		documenttypes_label: "Resource types",
		readers_count_label: "readers",
		documenttypes_tooltip:
			"The following resource types were taken into consideration in the creation of this visualization (not all of them may appear in the visualization):",
		area: "Area",
		areas_label: "Areas",
		streams_label: "Streams",
		items: "items",
		backlink: "← Back to overview",
		backlink_list: "Show all resources in area",
		backlink_list_streamgraph: "Show all resources",
		backlink_list_streamgraph_stream_selected: "Show all resources in stream",
		keywords: "Keywords",
		doctypes: "Resource type(s)",
		unknown: "Unknown",
		no_keywords: "not available",
		notAvailable: "not available",
		default_area: "No area title available",
		default_author: "",
		default_id: "defaultid",
		default_hash: "hashHash",
		default_abstract: "No abstract available",
		default_paper_title: "No title available",
		default_authors: "No authors available",
		default_published_in: "",
		// ? consider to remove it from here?
		// default_readers: 0,
		default_url: "",
		link: "link",
		default_year: "",
		embed_button_text: "Copy",
		copied_button_text: "Copied",
		sort_by_label: "sort by: ",
		comment_by_label: "by",
		pdf_not_loaded: "Sorry, we were not able to retrieve the PDF for this publication. You can get it directly from",
		pdf_not_loaded_linktext: "this website",
		// Not in the old eng strings (the old map showed nothing while loading).
		pdf_load_text: "Looking for the PDF…",
		share_button_title: "Share this visualization",
		share_button_title_sg: "Share this visualization",
		embed_title: "embed visualization",
		embed_button_title: "Embed this visualization on other websites",
		embed_button_title_sg: "Embed this visualization on other websites",
		embed_body_text: "You can use this code to embed the visualization on your own website or in a dashboard.",
		area_streamgraph: "Stream",
		stream_year: "Year",
		stream_doc_num: "Number of resources",
		stream_docs: "Resources",
		stream_total: "Total resources in stream",
		empty_area_warning: "No matches found. Please reset your filter options above.",
		lang_all: "All languages",
		cite: "Cite",
		filter_by_label: "show: ",
		cite_title_km: "Cite this visualization",
		cite_title_sg: "Cite this visualization",
		cite_title_geomap: "Cite this geo map",
		citation_template:
			"Open Knowledge Maps (${year}). ${type} for research on ${query}. Retrieved from ${source} [${date}].",
		cite_vis_km: "Please cite this knowledge map as follows",
		cite_vis_sg: "Please cite this streamgraph as follows",
		cite_vis_geomap: "Please cite this geo map as follows",
		cite_paper: "Cite this resource as",
		export_paper: "Export this resource",
		download: "Download",
		please_note: "Please note",
		scale_by_label: "Scale map by: ",
		// "Scale map by" choices (the old map had these for pubmed and orcid only).
		scale_label: {
			content_based: "Documents",
			citations: "Citations",
			cited_by_accounts_count: "Social media mentions",
			references: "References outside academia",
			citation_count: "Citations",
			cited_by_tweeters_count: "Tweets",
			"readers.mendeley": "Readers",
		},
		tweets: "tweets",
		social: "social media mentions",
		references: "references outside academia",
		citations: "citations",
		citation_warning:
			"we were not able to verify whether this citation is formatted correctly based on the metadata received. Please check before reuse.",
		location: "Location",
		location_fallback: "not available",
	},
	eng_pubmed: {
		loading: "Loading knowledge map.",
		relevance: "relevance",
		readers: "citations",
		year: "year",
		authors: "authors",
		title: "title",
		backlink: "← Back to overview",
		backlink_list: "← Show all resources",
		backlink_list_streamgraph: "← Show all resources",
		backlink_list_streamgraph_stream_selected: "← Show all resources in stream",
		unknown: "Unknown",
		streamgraph_label: "Streamgraph of",
		overview_authors_label: "Overview of the works of",
		streamgraph_authors_label: "Streamgraph of the works of",
		custom_title_explanation:
			"This is a custom title. Please see the info button for more information. Original query:",
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
		high_metadata_quality_desc_aquanavi:
			"This visualization only includes resources with an abstract (min. 300 characters). High metadata quality significantly improves the quality of your visualization.",
		low_metadata_quality: "Data quality",
		low_metadata_quality_desc_base:
			"This visualization includes resources with and without an abstract. Low metadata quality may significantly reduce the quality of your visualization.",
		low_metadata_quality_desc_pubmed:
			"This visualization includes resources with and without an abstract. Low metadata quality may significantly reduce the quality of your visualization.",
		low_metadata_quality_desc_aquanavi:
			"This visualization includes resources with and without an abstract. Low metadata quality may significantly reduce the quality of your visualization.",
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
	},
	eng_openaire: {
		relevance: "relevance",
		readers: "readers",
		tweets: "tweets",
		year: "year",
		authors: "authors",
		citations: "citations",
		title: "title",
		backlink: "← Back to overview",
		backlink_list: "Show all resources in area",
		unknown: "Unknown",
		documenttypes_label: "Article types",
		dataset_count_label: "datasets",
		paper_count_label: "papers",
		viper_edit_title: "How to add project resources",
		viper_edit_desc_label: `<p>Are you missing relevant publications and datasets related to this project? \
        <p>No problem: simply link further resources on the OpenAIRE website. \
        The resources will then be be automatically added to the map. \
        <p>Use the button indicated in the exemplary screenshot to do so: `,
		viper_button_desc_label: `<p>By clicking on the button below, you are redirected to the\
            OpenAIRE page for`,
		viper_edit_button_text: "continue to openaire",
		tweets_count_label: " tweets",
		citations_count_label: " citations (Crossref)",
		all: "any",
		open_access: "Open Access",
		publication: "papers",
		dataset: "datasets",
		items: "items",
		// citations_count_label: "citations",
		social_media_count_label: " social media mentions",
		references_count_label: "references outside academia",
	},
} satisfies Record<string, Strings>;

export type Language = keyof typeof languages;

const registered = new Map<string, Strings>();

/** Adds (or replaces) a language; its strings go over eng. */
export function registerLanguage(id: string, own: Strings): void {
	registered.set(id, own);
}

/** The strings for a language: eng with the language's own on top. */
export function strings(language: Language | string = "eng"): Strings {
	const own = registered.get(language) ?? (languages as Record<string, Strings>)[language] ?? {};
	return { ...languages.eng, ...own };
}

/** One string, or the key itself when it is missing. */
export function t(s: Strings, key: string): string {
	const v = s[key];
	return typeof v === "string" ? v : key;
}
