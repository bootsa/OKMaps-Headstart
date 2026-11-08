/**
 * Everything this app can build, by id: a build config (okmaps.config.json,
 * see packages/config) picks from it, and only the picked modules are
 * imported (virtual:okmaps/sources, /stores, /views).
 */
import { fileURLToPath } from "node:url";
import type { ModuleCatalog } from "@okmaps/config/vite";

const src = (file: string) => fileURLToPath(new URL(`./src/${file}`, import.meta.url));
const ui = "@okmaps/ui-svelte";

export const catalog: ModuleCatalog = {
	sources: {
		pubmed: { from: src("sources.ts"), export: "pubmedSource" },
		base: { from: src("sources.ts"), export: "baseSource" },
		openaire: { from: src("sources.ts"), export: "openaireSource" },
		// One source per place table.
		places: { from: src("sources.ts"), export: "placeModules", call: true },
	},
	sourceTypes: {
		sparql: { from: src("sparql-source.ts"), export: "sparqlSourceType" },
		zenodo: { from: src("zenodo-source.ts"), export: "zenodoSourceType" },
		zotero: { from: src("zotero-source.ts"), export: "zoteroSourceType" },
		openalex: { from: src("openalex-source.ts"), export: "openalexSourceType" },
	},
	storeTypes: {
		browser: { from: src("stores.ts"), export: "browserStoreType" },
		webdav: { from: src("stores.ts"), export: "webdavStoreType" },
		solid: { from: src("stores.ts"), export: "solidStoreType" },
		atomic: { from: src("stores.ts"), export: "atomicStoreType" },
	},
	views: {
		overview: { from: ui, export: "knowledgeMapView" },
		timeline: { from: ui, export: "streamgraphView" },
		geomap: { from: ui, export: "geomapView" },
	},
	plugins: {
		info: { from: ui, export: "infoPlugin" },
		"cite-map": { from: ui, export: "citeMapPlugin" },
		pdf: { from: ui, export: "pdfPlugin", call: true },
		"cite-paper": { from: ui, export: "citePaperPlugin" },
		"export-paper": { from: ui, export: "exportPaperPlugin" },
	},
};
