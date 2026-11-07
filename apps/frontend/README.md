# @okmaps/frontend

OKMaps in the browser. A person searches PubMed, BASE or an OpenAIRE
project; a Web Worker runs the search (`@okmaps/sources`), adds Crossref
citation counts for PubMed, lays out the map (`@okmaps/pipeline`) and the map
is saved in the browser (IndexedDB). `@okmaps/ui-svelte` draws it
(`src/svelte-map.ts`), with every plugin the package ships.

Nothing is stored on a server unless a person shares a map. The only server
involved is the gateway (`packages/gateway`), for BASE and for share links.

```
index.html   search form and the maps saved in this browser
map.html     one map (map.html?id=... saved here, map.html?shared=... a share link), drawn by @okmaps/ui-svelte
src/search.ts   search -> citations -> layout -> the record the map reads
src/worker.ts   runs search.ts off the main thread
src/store.ts    IndexedDB
src/share.ts    publishing and opening share links
src/offline.ts  registers the service worker
sw/sw.js        the service worker; scripts/sw-plugin.ts fills in its file list at build time
src/svelte-map.ts  draws a map and registers the plugins
```

## Building

```
pnpm install                # in the repository root
cd apps/frontend
cp .env.example .env        # set VITE_GATEWAY_URL
pnpm build                  # static site in dist/
```

`dist/` can be served by any static host. Set `APP_BASE=/some/path/` if
it is not served from the root. `pnpm dev` serves the app with hot reload.

### GitHub Pages

`.github/workflows/pages.yml` builds the site and publishes it to GitHub
Pages on every push to `main` that touches the app or its packages
(or by hand from the Actions tab). To turn it on, set the repository's
Settings > Pages > Source to "GitHub Actions". The site is then at
`https://<owner>.github.io/<repository>/`.

Every release is kept: pushing a tag `v*` (for example by publishing a
GitHub release) rebuilds the site with that version beside the others.
Releases are made with release-please (`.github/workflows/release.yml`): it
keeps a release PR open with the next version and changelog, worked out from
Conventional Commit messages (`feat:`, `fix:`, `feat!:` for a breaking
change); merging it tags the release and publishes it.

| Path | What |
|---|---|
| `/<repository>/` | sends visitors to `latest/` |
| `/<repository>/latest/` | the default branch |
| `/<repository>/v1.2.0/` | each release tag (the newest 20; repository variable `PAGES_MAX_VERSIONS`) |
| `/<repository>/versions.html`, `versions.json` | the list |

Each version is a separate build (`.github/scripts/build-pages.sh`) with its
own base path, service worker and cache. A release is built once and then
kept in the Actions cache, so a deploy builds only `latest` and new
releases; it is rebuilt if the cache entry is gone or `GATEWAY_URL` /
`CROSSREF_MAILTO` change. Maps and the storage choice are kept
per site, so every version sees the same maps. Each version's start page
shows its version with a link to the others.

Set the repository variable `GATEWAY_URL` to a running gateway to turn on
BASE searches and share links; without it they are off and the site says
so. `CROSSREF_MAILTO` sets the contact address sent to Crossref.

## Tests

```
pnpm typecheck && pnpm test
VITE_GATEWAY_URL=https://gateway.test pnpm build && pnpm test:browser
```

`pnpm test` makes a PubMed, a BASE and an OpenAIRE map in Node from recorded
provider answers. `test:browser` does the same through the built site in
headless Chromium (Playwright): it fills in the form, waits for the
visualisation to draw the map, checks the saved-maps list and deletion, and
an error message. It then shares a map, opens the link in a second browser
profile and saves it there, and opens a crafted map whose titles hold markup
to check that no script runs. Last, it goes offline and opens a saved map.
Screenshots go to `test-results/`.

### Parity with the current server

`test/parity/parity.test.ts` (part of `pnpm test`) compares the maps the app
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
Rscript apps/frontend/test/parity/legacy_maps.R apps/frontend/test/parity/legacy
python3 apps/frontend/test/parity/legacy_finish.py apps/frontend/test/parity/legacy
```

## Where maps are kept

By default maps are kept in the browser (IndexedDB). Under "Where your maps
are kept" on the start page a person can choose a WebDAV folder instead
(Nextcloud, ownCloud, or any WebDAV server that allows the site through
CORS), and copy the maps they have there. The choice, and the WebDAV
password, are kept in that browser's localStorage. Maps then follow the
person to any browser that uses the same folder. The storage adaptors are in
`packages/storage`. Maps made before this choice existed are moved into the
new browser storage once.

A Solid Pod works the same way after logging in (Solid-OIDC, with
`@inrupt/solid-client-authn-browser`, loaded only when a Pod is used). The
person names their identity provider and, optionally, a folder; without one
the maps go in `okmaps/` at the top of the Pod their WebID names. The login
lives in one page and restoring it passes through the provider, so only the
start page logs in. The map page reads Pod maps from a copy kept in the
browser (`okmaps-pod-copy`, made when the start page reads or saves a map),
and what it saves there (the share id) is sent to the Pod by the start page
next time. A map with no copy yet (a bookmark) goes through the start page,
which logs in, fetches it and comes back. The browser test runs this against
a simulated provider and Pod (`test/fake-solid.ts`).

An Atomic Data server works with a Folder or Drive URL and the agent's
secret (from User settings in the Atomic data browser), which is kept in the
browser's localStorage like the WebDAV password.

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
under `pnpm dev`.

Service workers need HTTPS (or `localhost`).

## Not there yet

These parts of the visualisation call the PHP server and are turned off or
do not work yet: PDF preview, metadata export, the visualisation's own share
and embed dialogs (the app's Share button replaces them), Hypothesis
annotations, analytics.
The timeline (streamgraph) view is not ported. No live provider has been
called from this app yet; that needs a deployed gateway and a browser.
