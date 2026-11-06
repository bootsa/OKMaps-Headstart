/**
 * Starts the gateway on Node (22.18 or later runs this file directly):
 *
 *   BASE_API_KEY=... ALLOWED_ORIGINS=https://maps.example.org PORT=8787 node src/server.ts
 *
 * Optional: TRUST_PROXY=1 behind a reverse proxy, OPENAIRE=off to turn the
 * OpenAIRE route off, MAPS_DIR=/data/maps to keep published maps (share
 * links) in that folder; without it, publishing is off.
 */
import { createGateway } from "./gateway.ts";
import { fileStore } from "./file-store.ts";
import { serve } from "./node.ts";

const env = process.env;
if (!env.BASE_API_KEY) {
  console.error("BASE_API_KEY is not set");
  process.exit(1);
}
const allowedOrigins = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (allowedOrigins.length === 0) {
  console.error("ALLOWED_ORIGINS is not set (comma-separated origins, or *)");
  process.exit(1);
}
const port = Number(env.PORT ?? 8787);
const handler = createGateway({
  baseApiKey: env.BASE_API_KEY,
  allowedOrigins,
  openaireUrl: env.OPENAIRE === "off" ? null : undefined,
  maps: env.MAPS_DIR ? { store: fileStore(env.MAPS_DIR) } : undefined,
});
serve(handler, { port, trustProxy: env.TRUST_PROXY === "1" });
console.log(`OKMaps gateway listening on port ${port}`);
