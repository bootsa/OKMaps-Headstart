/**
 * The build config of one OKMaps version (okmaps.config.json): what the
 * site offers, how its services are set up and how it looks. Every field is
 * optional; what is left out is as on the full site (defaults.ts).
 *
 * It is data only (JSON), so it can be committed per project, written by
 * the wizard (okmaps configure) or the web configurator, and read by any
 * app: it never names UI code, only module ids from the app's catalog.
 */

/** Metadata sources the site offers itself. "places" = a geo map of each place table. */
export type SourceId = "pubmed" | "base" | "openaire" | "places";
/** Kinds of source people can add on the settings page. */
export type SourceTypeId = "sparql" | "zenodo" | "zotero" | "openalex";
/** Kinds of map store. */
export type StoreTypeId = "browser" | "webdav" | "solid" | "atomic";
/** Map views (visType ids): knowledge map, streamgraph, geo map. */
export type ViewId = "overview" | "timeline" | "geomap";
/** Map plugins (buttons and panels on the map). */
export type PluginId = "info" | "cite-map" | "pdf" | "cite-paper" | "export-paper";
/** The skins in @okmaps/ui-svelte styles/skins.css. */
export type SkinId = "viper" | "cris_vis" | "linkedcat" | "covis";
export type SchemeChoice = "system" | "light" | "dark";

/** Things people can do or see; each can be switched off for a build. */
export interface Features {
	/** The settings page (settings.html) and links to it. */
	settingsPage: boolean;
	/** Switching the site's sources on and off on the settings page. */
	chooseSources: boolean;
	/** Adding own sources (of `sources.types`) on the settings page. */
	addSources: boolean;
	/** Adding, changing and removing map stores on the settings page. */
	addStores: boolean;
	/** The drawer with the person's maps on the start page. */
	explorer: boolean;
	/** "Keep the map in" in the search form (else maps go to the default store). */
	saveChoice: boolean;
	/** "Several sources" in the search form: one map from several sources. */
	combine: boolean;
	/** Share and Embed buttons on maps (they also need a gateway). */
	share: boolean;
	/** The light/dark switch on maps. */
	schemeToggle: boolean;
	/** Works offline (service worker). */
	offline: boolean;
	/** "Version … · other versions" on the start page (Pages builds). */
	versionLink: boolean;
}

/** A place table for geo maps (as VITE_PLACE_SOURCES). */
export interface PlaceTable {
	id?: string;
	label?: string;
	/** Map title when the search gives none. */
	title?: string;
	/** The table (CSV or JSON); relative URLs are resolved against the site. */
	url: string;
	format?: "csv" | "json";
	/** Use a preset's columns (and id, label and title unless given). */
	preset?: "aquanavi";
	/** Column names: title, latitude, longitude, ... (required without a preset). */
	mapping?: Record<string, unknown>;
}

/** A ready-made source of one of the source types, offered by the site to everyone. */
export interface PresetSource {
	/** Stable id; the source's id is "<type>:<id>". */
	id: string;
	type: SourceTypeId;
	/** Its name in the search form. */
	name: string;
	description?: string;
	/** The type's fields (endpoint, query, library, ...), as on the settings page. */
	config: Record<string, string>;
}

/** A ready-made config offered first when someone adds a source of a type. */
export interface TypePreset {
	id: string;
	label: string;
	description?: string;
	config: Record<string, string>;
}

/** A store everyone starts with (e.g. the project's WebDAV folder). */
export interface PresetStore {
	/** Stable id, used in map links. */
	id: string;
	type: StoreTypeId;
	name: string;
	config: Record<string, string>;
}

export interface Theme {
	/** One of the built-in skins. */
	skin?: SkinId;
	/** The scheme pages start in, unless the person chose one. */
	scheme?: SchemeChoice;
	/** Shorthand for --color-accent (buttons, links, focus). */
	accent?: string;
	/** Shorthand for --color-heading and --color-accent-strong. */
	heading?: string;
	/** Shorthand for --font-sans, e.g. "Lato, sans-serif". */
	font?: string;
	/** A stylesheet for the font (e.g. Google Fonts URL). */
	fontStylesheet?: string;
	/** Design tokens (CSS custom properties) to override, e.g. {"--color-link": "#0047bb"}. */
	tokens?: Record<string, string>;
	/** Tokens for the dark scheme. */
	darkTokens?: Record<string, string>;
	/** A CSS file (relative to the config file) added to every page. */
	css?: string;
	/** Logo shown above the start page's heading (URL or path under the site). */
	logo?: string;
	/** Page icon (URL or path under the site). */
	favicon?: string;
	/** <meta name="theme-color"> and the installed app's colour. */
	themeColor?: string;
}

export interface Services {
	/** The gateway (packages/gateway): BASE, share links, OpenAIRE fallback. Empty = none. */
	gatewayUrl?: string;
	/** Call OpenAIRE through the gateway. */
	openaireViaGateway?: boolean;
	/** Contact address for Crossref's polite pool. */
	crossrefMailto?: string;
	/** NCBI API key (a secret: raises PubMed's rate limit). */
	pubmedApiKey?: string;
}

/** okmaps.config.json as written: every field optional. */
export interface OkmapsConfig {
	$schema?: string;
	site?: {
		/** Name of the site: page titles, heading, installed app. */
		title?: string;
		/** The line under the heading. */
		lead?: string;
		/** Language of the pages (html lang). */
		lang?: string;
	};
	sources?: {
		/** The site's sources; default all. */
		offer?: SourceId[];
		/** Offered but switched off until people switch them on. */
		off?: string[];
		/** Place tables for "places"; default the bundled AQUANAVI table. */
		places?: PlaceTable[];
		/** Kinds of source people can add; default all. */
		types?: SourceTypeId[];
		/** Ready-made sources of those kinds, offered to everyone. */
		presets?: PresetSource[];
		/** Ready-made configs offered when someone adds a source of a kind. */
		typePresets?: Partial<Record<SourceTypeId, TypePreset[]>>;
	};
	stores?: {
		/** Kinds of store; default all. */
		types?: StoreTypeId[];
		/** Stores everyone starts with; default one "This browser" store when "browser" is offered. */
		presets?: PresetStore[];
		/** The store new maps go to: a preset store's id, or "none" (saved from the map page). */
		saveTo?: string;
	};
	/** Map views; default all. */
	views?: ViewId[];
	/** Map plugins; default all. */
	plugins?: PluginId[];
	features?: Partial<Features>;
	services?: Services;
	theme?: Theme;
	/**
	 * Allows secrets (passwords, API keys, tokens) in the build. Anyone who
	 * can open the site can read them; leave it off for public sites.
	 */
	allowSecrets?: boolean;
}

/** The config with every default filled in, as the app reads it. */
export interface ResolvedConfig {
	site: { title: string; lead: string; lang: string };
	sources: {
		offer: SourceId[];
		off: string[];
		places: PlaceTable[];
		types: SourceTypeId[];
		presets: PresetSource[];
		typePresets: Partial<Record<SourceTypeId, TypePreset[]>>;
	};
	stores: { types: StoreTypeId[]; presets: PresetStore[]; saveTo: string };
	views: ViewId[];
	plugins: PluginId[];
	features: Features;
	services: Required<Omit<Services, "pubmedApiKey">> & Pick<Services, "pubmedApiKey">;
	theme: Theme & { scheme: SchemeChoice };
	allowSecrets: boolean;
}
