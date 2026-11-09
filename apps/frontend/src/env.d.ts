/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Gateway base URL (packages/gateway). */
	readonly VITE_GATEWAY_URL?: string;
	/** "1" to call OpenAIRE through the gateway. */
	readonly VITE_OPENAIRE_VIA_GATEWAY?: string;
	/** Contact address sent to Crossref. */
	readonly VITE_CROSSREF_MAILTO?: string;
	/** Place sources for geo maps, a JSON list (src/places.ts); default: the bundled AQUANAVI table. */
	readonly VITE_PLACE_SOURCES?: string;
	/** Set by the Pages build: "latest" or the release tag. */
	readonly VITE_APP_VERSION?: string;
}

/** The build config (packages/config), resolved: see okmaps.catalog.ts and vite.config.ts. */
declare module "virtual:okmaps/config" {
	const config: import("@okmaps/config").ResolvedConfig;
	export default config;
}

/** The chosen sources (each a SourceModule) and source types (by id). */
declare module "virtual:okmaps/sources" {
	export const sources: import("@okmaps/ui-svelte").SourceModule[];
	export const sourceTypes: Partial<
		Record<import("@okmaps/config").SourceTypeId, import("@okmaps/ui-svelte").SourceType>
	>;
}

declare module "virtual:okmaps/stores" {
	export const storeTypes: import("@okmaps/ui-svelte").StoreType[];
}

declare module "virtual:okmaps/views" {
	export const views: import("@okmaps/ui-svelte").MapView[];
	export const plugins: import("@okmaps/ui-svelte").OkmPlugin[];
}

/** One constant per source, source type and view id: whether this build has it. */
declare module "virtual:okmaps/flags" {
	export const pubmed: boolean;
	export const base: boolean;
	export const openaire: boolean;
	export const places: boolean;
	export const sparql: boolean;
	export const zenodo: boolean;
	export const zotero: boolean;
	export const openalex: boolean;
	export const overview: boolean;
	export const timeline: boolean;
	export const geomap: boolean;
}
