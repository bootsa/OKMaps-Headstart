import type { SearchSettings } from "./search.ts";

/** Build-time settings (see .env.example). */
export const settings: SearchSettings = {
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8787",
  openaireViaGateway: import.meta.env.VITE_OPENAIRE_VIA_GATEWAY === "1",
  crossrefMailto: import.meta.env.VITE_CROSSREF_MAILTO || undefined,
};
