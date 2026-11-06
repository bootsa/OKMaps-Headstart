# @okmaps/app

OKMaps in the browser. A person searches PubMed, BASE or an OpenAIRE
project; a Web Worker runs the search (`@okmaps/sources`), adds Crossref
citation counts for PubMed, lays out the map (`@okmaps/pipeline`) and the map
is saved in the browser (IndexedDB). The existing visualisation (`vis/`)
shows it, reading it in its `local_files` mode, so maps look and behave as
they do on the site today.

Nothing is stored on a server. The only server involved is the gateway
(`packages/gateway`), for BASE.

```
index.html   search form and the maps saved in this browser
map.html     one map (map.html?id=...), drawn by vis/
src/search.ts   search -> citations -> layout -> the record vis/ reads
src/worker.ts   runs search.ts off the main thread
src/store.ts    IndexedDB
src/vis-config.ts  vis/ settings per service
```

## Building

```
npm ci                      # in the repository root, for vis/
cd packages/app && npm ci
npm run build:vis           # builds vis/ with webpack into public/vis
cp .env.example .env        # set VITE_GATEWAY_URL
npm run build               # static site in dist/
```

`dist/` can be served by any static host. Set `APP_BASE=/some/path/` for
both build steps if it is not served from the root. `npm run dev` serves the
app with hot reload (after `build:vis`).

## Tests

```
npm run typecheck && npm test
VITE_GATEWAY_URL=https://gateway.test npm run build && npm run test:browser
```

`npm test` makes a PubMed, a BASE and an OpenAIRE map in Node from recorded
provider answers. `test:browser` does the same through the built site in
headless Chromium (Playwright): it fills in the form, waits for the
visualisation to draw the map, checks the saved-maps list and deletion, and
an error message, and leaves screenshots in `test-results/`.

## Not there yet

These parts of the visualisation call the PHP server and are turned off or
do not work yet: PDF preview, metadata export, share and embed links,
Hypothesis annotations, analytics. Sharing comes with the publish step.
The timeline (streamgraph) view is not ported. No live provider has been
called from this app yet; that needs a deployed gateway and a browser.
