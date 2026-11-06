import { checkKey, checkPrefix, type MapStorage } from "./types.ts";

/** Keeps documents in memory (tests, local development). */
export function memoryStorage(): MapStorage {
	const docs = new Map<string, string>();
	return {
		label: "memory",
		get: async (key) => docs.get(checkKey(key)) ?? null,
		put: async (key, body) => void docs.set(checkKey(key), body),
		delete: async (key) => void docs.delete(checkKey(key)),
		list: async (prefix = "") => {
			checkPrefix(prefix);
			return [...docs.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).sort();
		},
	};
}
