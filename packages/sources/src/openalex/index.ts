/**
 * OpenAlex works as map records: search, filters, cursor paging, rate
 * limits, abstracts rebuilt from the inverted index. No UI code: the app's
 * settings page and a server can use it alike.
 */
export {
	abstractFromIndex,
	lastFirst,
	type OpenalexLocation,
	type OpenalexRecord,
	type OpenalexTerm,
	type OpenalexWork,
	plainText,
	subjectsOf,
	toOpenalexRecords,
} from "./records.js";
export {
	checkOpenalexConfig,
	OPENALEX_BASE,
	OPENALEX_REASONS,
	OPENALEX_SELECT,
	type OpenalexOptions,
	type OpenalexParams,
	type OpenalexResult,
	type OpenalexSearchIn,
	type OpenalexSourceConfig,
	openalexFilter,
	openalexUrl,
	searchOpenalex,
} from "./source.js";
