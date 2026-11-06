export type { SourceRecord, SourceResult } from "./types.js";
export { SourceError, errorReasons } from "./errors.js";
export type { FetchFn, HttpOptions } from "./http.js";
export { searchPubmed, buildPubmedTerm, parsePubmedXml, parseEsummary, toPubmedRecords } from "./pubmed.js";
export type { PubmedParams, PubmedOptions } from "./pubmed.js";
export {
  searchBase,
  buildBaseRequest,
  baseRequestParams,
  preprocessQuery,
  cleanSubject,
  parseBaseRepositories,
  fetchBaseContentProviders,
} from "./base/index.js";
export type { BaseOptions, BaseParams, BaseRequest, BasePaper } from "./base/index.js";
export { parseXml, textOf, findAll, findFirst, childElements } from "./xml.js";
export type { XmlElement, XmlNode } from "./xml.js";
export {
  searchOpenaire,
  getOpenaireProject,
  parseOpenaireXml,
  parseOpenaireProject,
  toOpenaireRecords,
  cleanOpenaireSubject,
  OPENAIRE_BASE,
} from "./openaire.js";
export type { OpenaireParams, OpenaireOptions, OpenairePaper, OpenaireProject, OpenaireOrganisation } from "./openaire.js";
export { addCitationCounts, fetchCitationCounts, CROSSREF_BASE } from "./crossref.js";
export type { CrossrefOptions } from "./crossref.js";
