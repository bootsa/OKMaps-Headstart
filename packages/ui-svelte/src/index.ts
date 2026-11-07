// The new OKMaps interface. Import "@okmaps/ui-svelte/styles.css" once for
// the tokens and base styles, and wrap the interface in an element with the
// `okmaps` class (and data-skin for a skin).
export { default as Button } from "./components/Button.svelte";
export { default as CopyButton } from "./components/CopyButton.svelte";
export { default as Dialog } from "./components/Dialog.svelte";
export { default as Highlight } from "./components/Highlight.svelte";
export { default as ModalHost } from "./components/ModalHost.svelte";
export { default as ScalePicker } from "./components/ScalePicker.svelte";
export { default as SchemeToggle } from "./components/SchemeToggle.svelte";
export { default as Tag } from "./components/Tag.svelte";
export { default as Tooltip } from "./components/Tooltip.svelte";
export {
	type MapConfig,
	mapConfig,
	registerService,
	type Service,
	type VisType,
} from "./data/config";
export { type ListQuery, listPapers } from "./data/filter";
export { highlightParts, queryTerms } from "./data/highlight";
export { citedBySum, outsideReferences, parsePlace, scaleMetric, scaleUnit, socialMentions } from "./data/papers";
export { processMap, resizeMap } from "./data/process";
export { MapState } from "./data/state.svelte";
export { parseStreams } from "./data/streams";
export type {
	Area,
	MapContext,
	MapRecord,
	Paper,
	Place,
	ProcessedMap,
	RawDocument,
	Stream,
	StreamgraphData,
} from "./data/types";
export {
	type ContextItem,
	contextItems,
	contextParams,
	type MapTitle,
	mapTitle,
	metadataQuality,
	modifier,
	timespan,
} from "./header/context";
export { default as Header } from "./header/Header.svelte";
export { engOrcid, engPlos, extraLanguages, ger, gerLinkedcat, registerLanguages } from "./i18n/languages";
export { registerLanguage, type Strings, strings, t } from "./i18n/strings";
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
export { applyScheme, initialScheme, type Scheme } from "./scheme";
export { default as Visualization } from "./Visualization.svelte";
export {
	getTheme,
	KnowledgeMap,
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
