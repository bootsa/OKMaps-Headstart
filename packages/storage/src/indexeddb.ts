/** The browser's own storage (IndexedDB): the default, works offline, nothing leaves the device. */
import { checkKey, checkPrefix, type MapStorage } from "./types.ts";

export function indexedDbStorage(dbName = "okmaps-storage", factory: IDBFactory = indexedDB): MapStorage {
	let db: Promise<IDBDatabase> | null = null;
	const open = () =>
		(db ??= new Promise((resolve, reject) => {
			const req = factory.open(dbName, 1);
			req.onupgradeneeded = () => req.result.createObjectStore("docs");
			req.onsuccess = () => {
				// Let another tab or page delete or upgrade the database: close, and reopen on next use.
				req.result.onversionchange = () => {
					req.result.close();
					db = null;
				};
				resolve(req.result);
			};
			req.onerror = () => {
				db = null;
				reject(req.error);
			};
		}));
	const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
		const tx = (await open()).transaction("docs", mode);
		const req = fn(tx.objectStore("docs"));
		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve(req.result);
			tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
		});
	};
	return {
		label: "this browser",
		get: async (key) => ((await run("readonly", (s) => s.get(checkKey(key)))) as string | undefined) ?? null,
		put: async (key, body) => void (await run("readwrite", (s) => s.put(body, checkKey(key)))),
		delete: async (key) => void (await run("readwrite", (s) => s.delete(checkKey(key)))),
		list: async (prefix = "") => {
			checkPrefix(prefix);
			const keys = (await run("readonly", (s) => s.getAllKeys())) as string[];
			return keys.filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).sort();
		},
	};
}
