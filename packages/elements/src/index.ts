/**
 * @okmaps/elements: OKMaps for any framework, or none.
 *
 * - Web components: <okmaps-map>, <okmaps-search>, <okmaps-settings>,
 *   <okmaps-explorer> (./elements.ts). Call defineElements() once, or load
 *   the ready-made bundle (dist/okmaps-elements.js), which also registers
 *   every view and the core plugins.
 * - Plain functions: createMap, createSearchForm, createSettingsPage,
 *   createExplorer (./api.ts).
 * - The registries and everything else of @okmaps/core, so a page using
 *   the bundle registers its sources, stores, views and plugins in the
 *   same copy the elements read.
 *
 * Svelte runs inside; nothing here asks the page to use it.
 */
import "@okmaps/ui-svelte/styles.css";

export * from "@okmaps/core";
export {
	AppSettings,
	coreViews,
	creditPlugin,
	embedPlugin,
	faqsPlugin,
	geomapView,
	getView,
	hasView,
	knowledgeMapView,
	type MapRef,
	type MapState,
	type MapTheme,
	type MapView,
	mapThemes,
	mapViews,
	type OkmPlugin,
	pdfPlugin,
	registerCorePlugins,
	registerCoreViews,
	registerIntegrations,
	registerPlugin,
	registerTheme,
	registerView,
	reloadPlugin,
	sharePlugin,
	streamgraphView,
	unregisterPlugin,
	unregisterView,
	viewsFor,
} from "@okmaps/ui-svelte";
export {
	createExplorer,
	createMap,
	createSearchForm,
	createSettingsPage,
	type ExplorerOptions,
	type MapHandle,
	type MapOptions,
	type MapSnapshot,
	type PartHandle,
	pageSettings,
	type SearchFormOptions,
	type SettingsPageOptions,
} from "./api";
export {
	defineElements,
	elements,
	fillMapHref,
	OkmapsExplorerElement,
	OkmapsMapElement,
	OkmapsSearchElement,
	OkmapsSettingsElement,
	type SearchEventDetail,
} from "./elements";
