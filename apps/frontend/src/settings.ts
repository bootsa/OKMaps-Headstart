import { config } from "./app.ts";
import type { SearchSettings } from "./search.ts";

/** The build's service settings (okmaps.config.json "services", or the VITE_* variables). */
export const settings: SearchSettings = {
	// Without a gateway (e.g. a GitHub Pages build with none set), BASE and share links are off.
	gatewayUrl: config.services.gatewayUrl || (import.meta.env.DEV ? "http://localhost:8787" : ""),
	openaireViaGateway: config.services.openaireViaGateway && !!config.services.gatewayUrl,
	crossrefMailto: config.services.crossrefMailto || undefined,
	pubmedApiKey: config.services.pubmedApiKey || undefined,
};
