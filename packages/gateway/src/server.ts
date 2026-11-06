/**
 * Starts the gateway on Node (22.18 or later runs this file directly):
 *
 *   BASE_API_KEY=... ALLOWED_ORIGINS=https://maps.example.org PORT=8787 node src/server.ts
 *
 * Optional: TRUST_PROXY=1 behind a reverse proxy, OPENAIRE=off to turn the
 * OpenAIRE route off, and where published maps (share links) are kept;
 * without one, publishing is off:
 *   MAPS_DIR=/data/maps                              files in a folder
 *   MAPS_WEBDAV_URL=https://dav.example.org/okmaps/  a WebDAV folder, with
 *     MAPS_WEBDAV_USER and MAPS_WEBDAV_PASSWORD (or MAPS_WEBDAV_TOKEN for a bearer token)
 */
import { type MapStorage, webdavStorage } from "@okmaps/storage";
import { fileStorage } from "@okmaps/storage/node";
import { createGateway } from "./gateway.ts";
import { storageMapStore } from "./maps.ts";
import { serve } from "./node.ts";

const env = process.env;
if (!env.BASE_API_KEY) {
	console.error("BASE_API_KEY is not set");
	process.exit(1);
}
const allowedOrigins = (env.ALLOWED_ORIGINS ?? "")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);
if (allowedOrigins.length === 0) {
	console.error("ALLOWED_ORIGINS is not set (comma-separated origins, or *)");
	process.exit(1);
}
const port = Number(env.PORT ?? 8787);

function mapsStorage(): MapStorage | undefined {
	if (env.MAPS_WEBDAV_URL) {
		return webdavStorage({
			url: env.MAPS_WEBDAV_URL,
			username: env.MAPS_WEBDAV_USER,
			password: env.MAPS_WEBDAV_PASSWORD,
			headers: env.MAPS_WEBDAV_TOKEN ? { authorization: `Bearer ${env.MAPS_WEBDAV_TOKEN}` } : undefined,
		});
	}
	if (env.MAPS_DIR) return fileStorage(env.MAPS_DIR);
	return undefined;
}
const storage = mapsStorage();
const handler = createGateway({
	baseApiKey: env.BASE_API_KEY,
	allowedOrigins,
	openaireUrl: env.OPENAIRE === "off" ? null : undefined,
	maps: storage ? { store: storageMapStore(storage) } : undefined,
});
serve(handler, { port, trustProxy: env.TRUST_PROXY === "1" });
console.log(`OKMaps gateway listening on port ${port}${storage ? `; share links kept in ${storage.label}` : ""}`);
