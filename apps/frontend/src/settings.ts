import type { SearchSettings } from "./search.ts";

/** Build-time settings (see .env.example). */
export const settings: SearchSettings = {
	// Without a gateway (e.g. a GitHub Pages build with none set), BASE and share links are off.
	gatewayUrl: import.meta.env.VITE_GATEWAY_URL || (import.meta.env.DEV ? "http://localhost:8787" : ""),
	openaireViaGateway: import.meta.env.VITE_OPENAIRE_VIA_GATEWAY === "1" && !!import.meta.env.VITE_GATEWAY_URL,
	crossrefMailto: import.meta.env.VITE_CROSSREF_MAILTO || undefined,
};
