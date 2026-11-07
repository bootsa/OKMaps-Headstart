/** Place tables cached in IndexedDB, so a geo map can be made when its source is down. */
import type { TableCache } from "@okmaps/sources";

export function idbTableCache(dbName = "okmaps-place-tables", factory: IDBFactory = indexedDB): TableCache {
	const db = new Promise<IDBDatabase>((resolve, reject) => {
		const req = factory.open(dbName, 1);
		req.onupgradeneeded = () => req.result.createObjectStore("tables");
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
	const run = <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) =>
		db.then(
			(d) =>
				new Promise<T>((resolve, reject) => {
					const req = op(d.transaction("tables", mode).objectStore("tables"));
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				}),
		);
	return {
		get: async (key) => ((await run("readonly", (s) => s.get(key))) as string | undefined) ?? null,
		put: async (key, body) => void (await run("readwrite", (s) => s.put(body, key))),
	};
}
