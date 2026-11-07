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
