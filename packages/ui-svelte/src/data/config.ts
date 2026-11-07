/**
 * Map settings for the services OKMaps draws: PubMed, BASE and OpenAIRE
 * searches, and AQUANAVI (mesocosm facilities from OAI-PMH through BASE). Values come from the old visualisation's
 * default-config.js and the app's per-service settings (apps/frontend
 * vis-config.ts).
 */
export type Service = "pubmed" | "base" | "openaire" | "aquanavi" | (string & {});

/** Knowledge map, streamgraph (keywords over time) or geo map. */
export type VisType = "overview" | "timeline" | "geomap";

export interface MapConfig {
	service: Service;
	visType: VisType;
	language: string;
	/** Which info page a service with several shows (OpenAIRE: "openaire" or "viper"). */
	infoType: string | null;
	/** Title-from-context style ("viper" for OpenAIRE). */
	titleStyle: "default" | "viper";
	/** No reader counts: papers are sized equally and sorted by relevance. */
	contentBased: boolean;
	/** Geo maps: a zoom control and a tile layer switcher (old geomap.featuresConfiguration). */
	geomapZoomControl: boolean;
	geomapLayerSwitcher: boolean;
	/** Colours of the streams, in turn (old streamgraph_colors). */
	streamgraphColors: string[];
	/** What the papers are sized by (old scale_by): a metric such as "citation_count", or "content_based". */
	scaleBy: string | null;
	/** The choices of "Scale map by" (old scale_types); none hides it. */
	scaleOptions: string[];
	/** A sentence per choice on what the sizes mean (old scale_explanation). */
	scaleExplanations: Record<string, string>;
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
	/** "Cite as" button on papers (with the cite-paper plugin). */
	citePapers: boolean;
	/** Document types that get no "Cite as" button (case-insensitive). */
	noCitationDoctypes: string[];
	showKeywords: boolean;
	highlightQueryTerms: boolean;
	/** A fixed title for the map (old config title). */
	presetTitle: string;
	/** Title the map after its search (old create_title_from_context). */
	createTitleFromContext: boolean;
	customTitle: string | null;
	/** A map of an author's works (old is_authorview). */
	isAuthorview: boolean;
	/** Show the context line below the title. */
	showContext: boolean;
	/** Add "(n open access)" to the number of resources. */
	showOaNumber: boolean;
	showTimestamp: boolean;
	showDataSource: boolean;
	/** Display names of the services. */
	serviceNames: Record<string, string>;
	/** A search returns at most this many resources. */
	maxDocuments: number;
	/** Names of document type codes in the search parameters (BASE's dctypenorm). */
	documentTypeNames: Record<string, string>;
}

/** BASE's document type codes (dctypenorm), as in packages/sources. */
const BASE_DOCUMENT_TYPES: Record<string, string> = {
	"4": "Audio",
	"11": "Book",
	"111": "Book part",
	"13": "Conference object",
	"16": "Course material",
	"7": "Dataset",
	"5": "Image/video",
	"12": "Journal/newspaper",
	"121": "Journal/newspaper article",
	"122": "Journal/newspaper other content",
	"17": "Lecture",
	"19": "Manuscript",
	"3": "Map",
	"52": "Moving image/video",
	"2": "Musical notation",
	F: "Other/Unknown material",
	"1A": "Patent",
	"14": "Report",
	"15": "Review",
	"6": "Software",
	"51": "Still image",
	"1": "Text",
	"18": "Thesis",
	"181": "Thesis: bachelor",
	"183": "Thesis: doctoral and postdoctoral",
	"182": "Thesis: master",
};

const common: Omit<MapConfig, "service" | "language" | "sortOptions" | "contentBased"> = {
	visType: "overview",
	infoType: null,
	scaleBy: null,
	scaleOptions: [],
	geomapZoomControl: true,
	geomapLayerSwitcher: true,
	streamgraphColors: [
		"#28a2a3",
		"#671A54",
		"#CC3380",
		"#7acca3",
		"#c999ff",
		"#ffe199",
		"#ccfff2",
		"#99DFFF",
		"#FF99AA",
		"#c5d5cf",
		"#FFBD99",
		"#2856A3",
	],
	scaleExplanations: {},
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
	noCitationDoctypes: [],
	showKeywords: true,
	highlightQueryTerms: true,
	presetTitle: "",
	createTitleFromContext: true,
	customTitle: null,
	isAuthorview: false,
	showContext: true,
	showOaNumber: false,
	showTimestamp: false,
	showDataSource: false,
	serviceNames: {
		plos: "PLOS",
		base: "BASE",
		pubmed: "PubMed",
		doaj: "DOAJ",
		openaire: "OpenAIRE",
		triple_km: "GoTriple",
		triple_sg: "GoTriple",
		orcid: "ORCID",
		aquanavi: "AQUANAVI",
	},
	maxDocuments: 100,
	documentTypeNames: BASE_DOCUMENT_TYPES,
};

const builtIn: Record<string, Partial<MapConfig>> = {
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

const registered = new Map<string, Partial<MapConfig>>();

/**
 * Adds (or replaces) a service's settings, over the BASE ones, for maps
 * from sources this package doesn't know (CoVis, GoTriple, ORCID, ...).
 */
export function registerService(service: string, settings: Partial<MapConfig>): void {
	registered.set(service, settings);
}

/** A service's settings; an unknown service gets the BASE ones. */
export function mapConfig(service: Service, overrides: Partial<MapConfig> = {}): MapConfig {
	const known = registered.get(service);
	const own = known ? { ...builtIn.base, ...known } : (builtIn[service] ?? builtIn.base);
	return {
		...common,
		...own,
		service,
		...overrides,
	} as MapConfig;
}
