# @okmaps/frontend

OKMaps in the browser. A person searches the metadata sources they have
turned on (PubMed, BASE, OpenAIRE, OpenAlex, Zenodo, Zotero, SPARQL
endpoints, place tables); a Web Worker runs the search (`@okmaps/sources`),
adds Crossref citation counts for PubMed, lays out the map
(`@okmaps/pipeline`) and the map is saved in the store they picked.
`@okmaps/ui-svelte` draws it (`src/svelte-map.ts`) with the view its params
name (knowledge map, streamgraph or geo map) and every plugin the package
ships.

Nothing is stored on a server unless a person shares a map or picks a
remote store. The only server of our own is the gateway
(`packages/gateway`), for BASE and for share links.

```
index.html     search form (fields of the enabled sources, where to save) and the drawer with your maps
map.html       one map (map.html?store=...&path=...&id=... saved, map.html?shared=... a share link), drawn by @okmaps/ui-svelte
settings.html  metadata sources and map stores
src/search.ts     search -> citations -> layout -> the record the map reads
src/worker.ts     runs search.ts off the main thread
src/sources.ts    the sources this site offers (registerSource, registerSourceType); *-source.ts are the configurable ones
src/stores.ts     the kinds of store this site offers (registerStoreType)
src/store.ts      the person's stores and saved maps; src/drafts.ts the maps made without saving
src/places.ts     place sources for geo maps; src/place-cache.ts keeps their tables in IndexedDB
src/share.ts      publishing and opening share links
src/offline.ts    registers the service worker
sw/sw.ts          the service worker; scripts/sw-plugin.ts strips its types and fills in its file list at build time
src/svelte-map.ts draws a map and registers the plugins
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

Without a config this is the full site. `OKMAPS_CONFIG=path/to/config.json
pnpm build` (or `pnpm okmaps build <config>` from the root) builds a custom
version: only the sources, stores, views and plugins the config picks, its
features, services and look. See [packages/config](../../packages/config/README.md).
The `VITE_*` variables still work and fill in what a config leaves out.

How the app is put together for a config: `okmaps.catalog.ts` maps each
module id to its code; the plugin from `@okmaps/config/vite` generates
`virtual:okmaps/config`, `/sources`, `/stores`, `/views` and `/flags`;
`src/app.ts` reads the config (features, title, scheme), and
`src/register-sources.ts`, `register-stores.ts` and `register-views.ts`
register the chosen modules on the pages that need them. The map worker
checks `virtual:okmaps/flags` (constants), so the search and pipeline code
of left-out sources and views is not built either. In the pages,
`data-okmaps="title"` / `"lead"` mark what the config names and
`data-okmaps-feature="<feature>"` marks an element that goes when the
feature is off.

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

### Parity with the old server

`test/parity/parity.test.ts` (part of `pnpm test`) compares the maps the app
makes from the recorded provider answers with the maps the old server made
from the same answers. The server's maps (`test/parity/legacy/*.json.gz`) are
made by running the server's own code: the R and Python source stages (as
recorded in `packages/sources/test/golden`), the PubMed citation merge,
`vis_layout()`, and the pandas and PHP steps before vis/ reads the data.
It checks the documents, every field, which papers share an area, the area
titles, and the layout (against R's own run-to-run variation), and writes a
summary to `test-results/parity.md`. Intended differences are listed in the
test with their reasons.

The scripts that made the server's maps (`test/parity/legacy_maps.R` and
`legacy_finish.py`) ran the old server's code and were removed with the
`legacy/` folder; check out commit `ec6a09b` to run them again.

## Streamgraphs and geo maps

"Map type" on the start page makes a streamgraph instead of a knowledge map
from a PubMed or BASE search: the keyword counts per year from the
pipeline's streamgraph step (`@okmaps/pipeline/streamgraph`), with the
records that appear in them. The map keeps `vis_type: "timeline"` in its
params, and the map page draws each map with the view its params name.

Geo maps come from place sources (`@okmaps/sources`, "Places"): a table of
places and a mapping of its columns. The site offers each place source as a
source choice; a geo map shows every place in the table. The default is the
AQUANAVI mesocosm facility table bundled at `public/data/aquanavi.csv`; a
build names its own in `VITE_PLACE_SOURCES`, a JSON list such as

```
[{"preset":"aquanavi","url":"https://example.org/aquanavi.csv"},
 {"id":"stations","label":"Field stations","url":"https://example.org/stations.json",
  "mapping":{"title":"name","url":"website","latitude":"lat","longitude":"lon","keywords":"topics",
             "description":[{"column":"about","label":"About"}]}}]
```

The worker keeps the last table of each source in IndexedDB
(`okmaps-place-tables`) and uses it for a day, and when the source can't be
reached after that.

## Where maps are kept

Maps are kept in stores the person sets up on the settings page
(`settings.html`): this browser (IndexedDB, the default), WebDAV folders
(Nextcloud, ownCloud, or any WebDAV server that allows the site through
CORS), Solid Pods and Atomic Data servers, several of a kind with their own
names. The drawer on the start page shows every store as a folder tree:
maps can be opened, deleted and dragged between stores and subfolders, and
each store's maps exported to a file (a backup, or a way to another browser)
and a file imported into it. The
search form asks where to save a new map, or not to save it yet; such a map
can be saved later from the map page. The settings, and passwords or
secrets, are kept in that browser's localStorage. The storage adaptors are
in `packages/storage`.

A Solid Pod needs a login (Solid-OIDC, with
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

Hypothesis annotations and analytics from the old site are not ported.
