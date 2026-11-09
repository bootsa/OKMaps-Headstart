// The new OKMaps interface. Import "@okmaps/ui-svelte/styles.css" once for
// the tokens and base styles, and wrap the interface in an element with the
// `okmaps` class (and data-skin for a skin).
//
// Everything from @okmaps/core (processing, view types, sources and stores
// registries, settings, wording) is re-exported here too.
export * from "@okmaps/core";
export { default as Button } from "./components/Button.svelte";
export { default as CopyButton } from "./components/CopyButton.svelte";
export { default as Dialog } from "./components/Dialog.svelte";
export { default as Highlight } from "./components/Highlight.svelte";
export { default as ModalHost } from "./components/ModalHost.svelte";
export { default as ScalePicker } from "./components/ScalePicker.svelte";
export { default as SchemeToggle } from "./components/SchemeToggle.svelte";
export { default as Tag } from "./components/Tag.svelte";
export { default as Tooltip } from "./components/Tooltip.svelte";
export { MapState } from "./data/state.svelte";
export * from "./explorer";
export { default as Header } from "./header/Header.svelte";
export { authorsLine, List, ListEntry, shortTitle } from "./list";
export {
	activePlugins,
	findInfoPage,
	findModal,
	type InfoPage,
	type MapAction,
	type ModalProps,
	type OkmPlugin,
	type Overlay,
	type PaperAction,
	type PaperMetric,
	paperActions,
	paperMetrics,
	pluginTitle,
	registerPlugin,
	unregisterPlugin,
} from "./plugins";
export {
	type CreditOptions,
	citeMapPlugin,
	citePaperPlugin,
	corePlugins,
	creditPlugin,
	type EmbedOptions,
	embedPlugin,
	exportPaperPlugin,
	faqsPlugin,
	infoPlugin,
	type PdfOptions,
	pdfPlugin,
	type ReloadOptions,
	registerCorePlugins,
	reloadPlugin,
	type ShareOptions,
	sharePlugin,
} from "./plugins/core";
export { citationDate, mapCitation } from "./plugins/core/cite-map/citation";
export { type CitationStyle, citationStyles, cslRecord, paperCitation } from "./plugins/core/cite-paper/citation";
export { createdAt, withoutEmbed } from "./plugins/core/credit/credit";
export { bibtexType, paperBibtex } from "./plugins/core/export-paper/bibtex";
export { directPdf, hasFile, hasPdf, isNonText, type PdfResolver } from "./plugins/core/pdf/pdf";
export { embedCode, embedUrl, type LinkMaker, pageLink, shareTargets } from "./plugins/core/share/links";
export {
	covisPlugin,
	gsheetsPlugin,
	type OrcidOptions,
	orcidPlugin,
	registerIntegrations,
	triplePlugin,
	viperPlugin,
} from "./plugins/integrations";
export * from "./search";
export * from "./settings";
// Svelte-reactive settings, rather than core's plain class of the same name.
export { AppSettings } from "./settings/settings.svelte";
export { default as Visualization } from "./Visualization.svelte";
export { coreViews, registerCoreViews } from "./views/core";
export { Geomap, geomapProcessor, geomapView, pinLabel, type TileLayerSpec, tileLayers } from "./views/geomap";
export {
	getTheme,
	KnowledgeMap,
	knowledgeMapProcessor,
	knowledgeMapView,
	labelsTheme,
	layoutMap,
	type MapTheme,
	mapGeometry,
	mapThemes,
	octagonShape,
	octagonsTheme,
	originalTheme,
	polygonShape,
	registerTheme,
	ThemePicker,
} from "./views/knowledge-map";
export { getView, hasView, mapViews, registerView, unregisterView, viewsFor } from "./views/registry";
export {
	type LabelBox,
	labelBox,
	Streamgraph,
	separateLabels,
	streamgraphProcessor,
	streamgraphView,
} from "./views/streamgraph";
export type { MapView, ProcessInput, ViewProcessor, ViewProps } from "./views/types";
