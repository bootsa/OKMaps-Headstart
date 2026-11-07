/**
 * Builds maps off the main thread. Messages in: { request, settings }.
 * Messages out: { type: "stage", stage }, { type: "done", map } or
 * { type: "error", message, reasons }.
 */
import { loadDefaultResources } from "@okmaps/pipeline";
import { idbTableCache } from "./place-cache.ts";
import { buildMap, type SearchRequest, type SearchSettings } from "./search.ts";

declare const self: DedicatedWorkerGlobalScope;

let resources: ReturnType<typeof loadDefaultResources> | null = null;
const getResources = () => (resources ??= loadDefaultResources());

self.onmessage = async (e: MessageEvent<{ request: SearchRequest; settings: SearchSettings }>) => {
	try {
		// A cache that can't be opened (private mode) just means no fallback table.
		const placeCache = typeof indexedDB === "undefined" ? undefined : idbTableCache();
		const map = await buildMap(e.data.request, { ...e.data.settings, placeCache }, getResources, (stage) =>
			self.postMessage({ type: "stage", stage }),
		);
		self.postMessage({ type: "done", map });
	} catch (err) {
		const reasons = (err as { reasons?: unknown }).reasons;
		self.postMessage({
			type: "error",
			message: err instanceof Error ? err.message : String(err),
			reasons: Array.isArray(reasons) ? reasons : [],
		});
	}
};
