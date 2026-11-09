import { features } from "./app.ts";

/**
 * Registers the service worker (built sites only), so saved maps open
 * offline. A build without it ("offline": false) removes one an earlier
 * build of the site left.
 */
export function registerServiceWorker(): void {
	if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
	if (!features.offline) {
		navigator.serviceWorker
			.getRegistrations()
			.then((all) => Promise.all(all.map((r) => r.unregister())))
			.catch(() => {});
		return;
	}
	navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
