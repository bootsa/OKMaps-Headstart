/**
 * Map settings for the services OKMaps draws: PubMed, BASE and OpenAIRE
 * searches, and AQUANAVI (mesocosm facilities from OAI-PMH through BASE). Values come from the old visualisation's
 * default-config.js and the app's per-service settings (apps/frontend
 * vis-config.ts).
 */
export type Service = "pubmed" | "base" | "openaire" | "aquanavi";

/** Knowledge map, streamgraph (keywords over time) or geo map. */
export type VisType = "overview" | "timeline" | "geomap";

export interface MapConfig {
	service: Service;
	visType: VisType;
	language: string;
	/** Title-from-context style ("viper" for OpenAIRE). */
	titleStyle: "default" | "viper";
	/** No reader counts: papers are sized equally and sorted by relevance. */
	contentBased: boolean;
	/** Scale the bubbles and papers with the number of papers. */
	dynamicSizing: boolean;
	urlPrefix: string | null;
	urlPrefixDatasets: string | null;
	doiOutlink: boolean;
	convertAuthorNames: boolean;
	sortOptions: string[];
	filterOptions: string[];
	/** Area and paper sizes at the reference chart size (px). */
	referenceSize: number;
	minAreaSize: number;
	maxAreaSize: number;
	minDiameterSize: number;
	maxDiameterSize: number;
	bubbleMinScale: number;
	bubbleMaxScale: number;
	paperMinScale: number;
	paperMaxScale: number;
	paperWidthFactor: number;
	paperHeightFactor: number;
	/** Starting alpha of the area layout (higher = more movement). */
	areaForceAlpha: number;
	citePapers: boolean;
	showKeywords: boolean;
	highlightQueryTerms: boolean;
}

const common: Omit<MapConfig, "service" | "language" | "sortOptions" | "contentBased"> = {
	visType: "overview",
	titleStyle: "default",
	dynamicSizing: false,
	urlPrefix: null,
	urlPrefixDatasets: null,
	doiOutlink: true,
	convertAuthorNames: true,
	filterOptions: ["all", "open_access"],
	referenceSize: 650,
	minAreaSize: 50,
	maxAreaSize: 110,
	minDiameterSize: 30,
	maxDiameterSize: 50,
	bubbleMinScale: 1,
	bubbleMaxScale: 1,
	paperMinScale: 1,
	paperMaxScale: 1,
	paperWidthFactor: 1.2,
	paperHeightFactor: 1.6,
	areaForceAlpha: 0.02,
	citePapers: false,
	showKeywords: true,
	highlightQueryTerms: true,
};

const byService: Record<Service, Partial<MapConfig>> = {
	pubmed: {
		language: "eng_pubmed",
		bubbleMinScale: 1.2,
		sortOptions: ["readers", "title", "authors", "year"],
		areaForceAlpha: 0.015,
		contentBased: false,
	},
	base: {
		language: "eng",
		sortOptions: ["relevance", "title", "authors", "year"],
		contentBased: true,
		urlPrefix: "https://www.base-search.net/Record/",
		citePapers: true,
	},
	openaire: {
		language: "eng_openaire",
		dynamicSizing: true,
		sortOptions: ["relevance", "title", "authors", "year"],
		areaForceAlpha: 0.015,
		contentBased: true,
		urlPrefix: "https://www.openaire.eu/search/publication?articleId=",
		urlPrefixDatasets: "https://www.openaire.eu/en/search/dataset?datasetId=",
		titleStyle: "viper",
	},
	aquanavi: {
		language: "eng",
		sortOptions: ["relevance", "title", "authors", "year"],
		contentBased: true,
		urlPrefix: null,
	},
};

export function mapConfig(service: Service, overrides: Partial<MapConfig> = {}): MapConfig {
	return {
		...common,
		service,
		...byService[service],
		...overrides,
	} as MapConfig;
}
