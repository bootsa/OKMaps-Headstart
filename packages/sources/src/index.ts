export type { BaseOptions, BasePaper, BaseParams, BaseRequest } from "./base/index.js";
export {
	baseRequestParams,
	buildBaseRequest,
	cleanSubject,
	fetchBaseContentProviders,
	parseBaseRepositories,
	preprocessQuery,
	searchBase,
} from "./base/index.js";
export type { CrossrefOptions } from "./crossref.js";
export { addCitationCounts, CROSSREF_BASE, fetchCitationCounts } from "./crossref.js";
export { errorReasons, SourceError } from "./errors.js";
export type { FetchFn, HttpOptions } from "./http.js";
export type {
	OpenaireOptions,
	OpenaireOrganisation,
	OpenairePaper,
	OpenaireParams,
	OpenaireProject,
} from "./openaire.js";
export {
	cleanOpenaireSubject,
	getOpenaireProject,
	OPENAIRE_BASE,
	parseOpenaireProject,
	parseOpenaireXml,
	searchOpenaire,
	toOpenaireRecords,
} from "./openaire.js";
export {
	AQUANAVI_MAPPING,
	aquanaviSource,
	type CacheOptions,
	cachedTable,
	csvTable,
	type DescriptionSection,
	getPlaceSource,
	jsonTable,
	memoryTableCache,
	type PlaceMapping,
	type PlaceOptions,
	type PlaceRecord,
	type PlaceResult,
	type PlaceSource,
	parseCsv,
	placeSources,
	type Row,
	registerPlaceSource,
	searchPlaces,
	staticTable,
	type TableCache,
	type TableLoader,
	toPlaceRecords,
	unregisterPlaceSource,
} from "./places/index.js";
export type { PubmedOptions, PubmedParams } from "./pubmed.js";
export { buildPubmedTerm, parseEsummary, parsePubmedXml, searchPubmed, toPubmedRecords } from "./pubmed.js";
export * from "./sparql/index.js";
export type { SourceRecord, SourceResult } from "./types.js";
export type { XmlElement, XmlNode } from "./xml.js";
export { childElements, findAll, findFirst, parseXml, textOf } from "./xml.js";
export * from "./zenodo/index.js";
