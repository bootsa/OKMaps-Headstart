/**
 * @okmaps/core: everything about a map that is not drawing it, with no UI
 * framework. A map record goes in (processMap), papers, areas, streams and
 * places come out, ready for any renderer: the Svelte interface
 * (@okmaps/ui-svelte), the web components (@okmaps/elements) or your own
 * in React, Vue or plain DOM.
 *
 * Also here: the view types (what each kind of map needs and how the
 * interface talks about it), the metadata sources and map store types
 * registries, the person's settings, wording and languages.
 */
export * from "./context";
export * from "./data/config";
export * from "./data/filter";
export * from "./data/fold";
export * from "./data/highlight";
export * from "./data/papers";
export * from "./data/process";
export * from "./data/scale";
export * from "./data/streams";
export * from "./data/types";
export * from "./format";
export * from "./i18n/languages";
export * from "./i18n/strings";
export * from "./scheme";
export * from "./search";
export * from "./settings/fields";
export * from "./settings/registry";
export * from "./settings/settings";
export * from "./views/core";
export * from "./views/geomap";
export * from "./views/knowledge-map";
export * from "./views/registry";
export * from "./views/streamgraph";
export * from "./views/types";
