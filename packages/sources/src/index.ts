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
export type { PubmedOptions, PubmedParams } from "./pubmed.js";
export { buildPubmedTerm, parseEsummary, parsePubmedXml, searchPubmed, toPubmedRecords } from "./pubmed.js";
export type { SourceRecord, SourceResult } from "./types.js";
export type { XmlElement, XmlNode } from "./xml.js";
export { childElements, findAll, findFirst, parseXml, textOf } from "./xml.js";
