/**
 * Zotero sources: a personal or group library, or one of its collections,
 * through the Zotero Web API v3. No UI code: the app's settings page and a
 * server can use it alike.
 */
export {
	nextLink,
	resetZoteroBackoff,
	waitHeaderMs,
	ZOTERO_API,
	ZOTERO_REASONS,
	type ZoteroOptions,
	type ZoteroResponse,
	zoteroGet,
} from "./client.js";
export {
	creatorNames,
	doiOf,
	itemTypeLabel,
	NOT_DOCUMENTS,
	toZoteroRecords,
	type ZoteroCreator,
	type ZoteroItem,
	type ZoteroRecord,
	zoteroYear,
} from "./records.js";
export {
	checkZoteroConfig,
	libraryId,
	libraryPath,
	MAX_ZOTERO_ITEMS,
	parseZoteroLibrary,
	searchZotero,
	withoutApiKey,
	withSubcollections,
	type ZoteroCollection,
	type ZoteroKeyInfo,
	type ZoteroLibrary,
	type ZoteroLibraryChoice,
	type ZoteroParams,
	type ZoteroResult,
	type ZoteroSearchOptions,
	type ZoteroSourceConfig,
	zoteroCollections,
	zoteroKeyInfo,
	zoteroLibraries,
} from "./source.js";
