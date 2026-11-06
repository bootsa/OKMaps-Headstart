/*
 * OKMaps service worker. The build (scripts/sw-plugin.ts) writes the list of
 * files to keep and a version made from their contents in place of the two
 * placeholders below.
 *
 * - The app and the visualisation's scripts and styles are stored at install,
 *   so saved maps open without a network.
 * - Other files of the site (fonts, images) are stored the first time they
 *   are loaded.
 * - Requests to other sites (the gateway, providers) always go to the
 *   network.
 *
 * A new version waits until no page of the old one is open, so a page never
 * mixes files from two builds.
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
// One cache per scope: several versions of the app can live side by side on
// one site (latest/, v1.2.0/, …), each with its own service worker.
const PREFIX = `okmaps-${new URL(self.registration.scope).pathname}`;
const CACHE = `${PREFIX}${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // This scope's older caches, and those from before caches were per scope.
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PREFIX) && k !== CACHE) || /^okmaps-[0-9a-f]+$/.test(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(answer(req, url));
});

async function answer(req, url) {
  const cache = await caches.open(CACHE);
  if (req.mode === "navigate") {
    // map.html?id=... is map.html; the scope root is index.html.
    const page = url.pathname.endsWith("/") ? new URL("index.html", url) : new URL(url.pathname, url);
    const hit = await cache.match(page.href);
    if (hit) return hit;
  }
  const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic" && !url.pathname.endsWith("/sw.js")) cache.put(req, res.clone());
  return res;
}
