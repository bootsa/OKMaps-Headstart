/** Registers the service worker (built sites only), so saved maps open offline. */
export function registerServiceWorker(): void {
	if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
	navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
