# @okmaps/app

OKMaps in the browser. A person searches PubMed, BASE or an OpenAIRE
project; a Web Worker runs the search (`@okmaps/sources`), adds Crossref
citation counts for PubMed, lays out the map (`@okmaps/pipeline`) and the map
is saved in the browser (IndexedDB). The existing visualisation (`vis/`)
shows it, reading it in its `local_files` mode, so maps look and behave as
they do on the site today.

Nothing is stored on a server unless a person shares a map. The only server
involved is the gateway (`packages/gateway`), for BASE and for share links.

```
index.html   search form and the maps saved in this browser
map.html     one map (map.html?id=... saved here, map.html?shared=... a share link), drawn by vis/
src/search.ts   search -> citations -> layout -> the record vis/ reads
src/worker.ts   runs search.ts off the main thread
src/store.ts    IndexedDB
src/share.ts    publishing and opening share links
src/offline.ts  registers the service worker
sw/sw.js        the service worker; scripts/sw-plugin.ts fills in its file list at build time
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
an error message. It then shares a map, opens the link in a second browser
profile and saves it there, and opens a crafted map whose titles hold markup
to check that no script runs. Last, it goes offline and opens a saved map.
Screenshots go to `test-results/`.

### Parity with the current server

`test/parity/parity.test.ts` (part of `npm test`) compares the maps the app
makes from the recorded provider answers with the maps today's server makes
from the same answers. The server's maps (`test/parity/legacy/*.json.gz`) are
made by running the server's own code: the R and Python source stages (as
recorded in `packages/sources/test/golden`), the PubMed citation merge,
`vis_layout()`, and the pandas and PHP steps before vis/ reads the data.
It checks the documents, every field, which papers share an area, the area
titles, and the layout (against R's own run-to-run variation), and writes a
summary to `test-results/parity.md`. Intended differences are listed in the
test with their reasons.

To remake the server's maps (needs R with the packages listed in
`packages/pipeline/test/golden/r/generate_goldens.R`, and pandas), from the
repository root:

```
Rscript packages/app/test/parity/legacy_maps.R packages/app/test/parity/legacy
python3 packages/app/test/parity/legacy_finish.py packages/app/test/parity/legacy
```

## Share links

On a saved map, Share publishes it to the gateway once and shows the link
(the id is kept with the saved map). Anyone opening the link sees the map and
can save their own copy. A published map is fixed: changes made later to the
saved map are not seen through an old link.

## Installing and offline use

The built site is a Progressive Web App: browsers offer to install it, and
saved maps open without a network. At install the service worker stores the
pages, the app's scripts and the visualisation's scripts and styles (about
11 MB, 3 MB compressed); fonts and images are stored the first time they are
used. Requests to the gateway and the providers always go to the network, so
making a map or opening a share link needs a connection. A new build is
picked up once every open tab of the old one is closed. Nothing of this runs
under `npm run dev`.

Service workers need HTTPS (or `localhost`).

## Not there yet

These parts of the visualisation call the PHP server and are turned off or
do not work yet: PDF preview, metadata export, the visualisation's own share
and embed dialogs (the app's Share button replaces them), Hypothesis
annotations, analytics.
The timeline (streamgraph) view is not ported. No live provider has been
called from this app yet; that needs a deployed gateway and a browser.
