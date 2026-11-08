# @okmaps/config

Custom versions of OKMaps from one config file. A config says what a
version offers (sources, kinds of store, map views, plugins), what people
can do (settings page, own sources, sharing, …), how its services are set up
(gateway, Crossref, ready-made sources and stores) and how it looks (title,
colours, fonts, logo, skin, light or dark). Only what it picks is built:
left-out sources, stores and views are not in the site at all.

Three ways to make one:

- **In the terminal:** `pnpm okmaps configure configs/my-project.json` asks
  the questions and writes the file (run it again to change it).
- **In the browser:** the [configurator](https://bootsa.github.io/OKMaps-Headstart/configure/)
  (`apps/configurator`) shows a preview of the look and the file to download.
- **By hand:** a JSON file; `schema.json` gives editors completion and checks.

Then, from the repository root:

    pnpm okmaps check configs/my-project.json    # errors, warnings, secrets
    pnpm okmaps print configs/my-project.json    # with every default filled in
    pnpm okmaps build configs/my-project.json --out dist-my-project [--base /maps/]

`dist-my-project/` is a static site for any web server. On GitHub, the
"Custom build" workflow (Actions tab) builds a committed config and keeps
the site as a download. `OKMAPS_CONFIG=<file> pnpm build` does the same as
`okmaps build` into `apps/frontend/dist`.

## The file

Everything is optional; what is left out is as on the full site. So `{}` is
the full site, and a config only says what is special:

```json
{
	"$schema": "../packages/config/schema.json",
	"site": { "title": "Biomed Maps", "lead": "Knowledge maps of PubMed topics." },
	"sources": { "offer": ["pubmed"], "types": [] },
	"stores": { "types": ["browser"] },
	"views": ["overview"],
	"features": { "settingsPage": false, "share": false },
	"theme": { "accent": "#7a2e8e", "themeColor": "#7a2e8e" }
}
```

| Setting | What | Default |
|---|---|---|
| `site.title`, `site.lead`, `site.lang` | name (page titles, heading, installed app), the line under the heading, page language | Open Knowledge Maps, en |
| `sources.offer` | the site's sources: `pubmed`, `base`, `openaire`, `places` (a geo map of each place table) | all |
| `sources.places` | place tables for `places`: `{ "url", "preset": "aquanavi" }` or `{ "id", "label", "url", "mapping": { "title", "latitude", "longitude", … } }` | the bundled AQUANAVI table |
| `sources.types` | kinds of source people can add on the settings page: `sparql`, `zenodo`, `zotero`, `openalex` | all |
| `sources.presets` | ready-made sources of those kinds for everyone: `{ "id", "type", "name", "description", "config" }` | none |
| `sources.typePresets` | ready-made configs offered first when someone adds a source of a kind, by kind | none |
| `sources.off` | source ids offered but switched off at first (`"base"`, `"zotero:<id>"`) | none |
| `stores.types` | kinds of store: `browser`, `webdav`, `solid`, `atomic` | all |
| `stores.presets` | stores everyone starts with: `{ "id", "type", "name", "config" }` | "This browser" |
| `stores.saveTo` | the preset store new maps go to, or `"none"` (saved from the map page) | the first preset |
| `views` | map views: `overview` (knowledge map), `timeline` (streamgraph), `geomap` | all |
| `plugins` | map plugins: `info`, `cite-map`, `pdf`, `cite-paper`, `export-paper` | all |
| `features.*` | `settingsPage`, `chooseSources`, `addSources`, `addStores`, `explorer`, `saveChoice`, `combine`, `share`, `schemeToggle`, `offline`, `versionLink` (true/false) | all true |
| `services.gatewayUrl` | the gateway (BASE, share links, OpenAIRE fallback) | none |
| `services.crossrefMailto`, `services.openaireViaGateway` | Crossref contact address; OpenAIRE through the gateway | none, false |
| `services.pubmedApiKey` | NCBI API key (a secret) | none |
| `theme.accent`, `theme.heading`, `theme.font` | shorthands for `--color-accent`, `--color-heading`, `--font-sans` | |
| `theme.tokens`, `theme.darkTokens` | any design tokens (CSS custom properties, see `packages/ui-svelte/src/styles/tokens.css`), light and dark | |
| `theme.skin` | `viper`, `cris_vis`, `linkedcat`, `covis` | none |
| `theme.scheme` | `system`, `light` or `dark`: what the map and settings pages start in | system |
| `theme.fontStylesheet`, `theme.css` | a font stylesheet URL; a CSS file (next to the config) added to every page | |
| `theme.logo`, `theme.favicon`, `theme.themeColor` | logo above the heading, page icon, browser and app colour | |
| `allowSecrets` | allow passwords, API keys and tokens in the build | false |

A preset's `config` takes the fields of its kind as the settings page has
them, e.g. Zotero `{ "library": "other", "other_library": "groups/2829873" }`,
Zenodo `{ "community": "aquacosm" }`, SPARQL `{ "endpoint", "query" }`,
OpenAlex `{ "filter" }`, WebDAV `{ "url", "username" }`. See `examples/`.

Colours in `theme` are for the light scheme; the dark scheme keeps its own
unless `darkTokens` gives them (an accent that reads well on white rarely
does on dark grey). Fonts and other tokens apply to both. The config's
tokens win over the skin's.

## Secrets and environment variables

Whatever is in the config is in the site, and anyone who can open the site
can read it. So a config with a secret (a WebDAV password, an Atomic Data
agent secret, a Zotero, OpenAlex or NCBI API key, a Zenodo token) does not
build unless it says `"allowSecrets": true`, and even then every check and
build prints a warning. Only do that for a site that is not public.

Any text can name an environment variable, read when building:
`"${env:NAME}"`, or `"${env:NAME:-fallback}"`. That keeps per-deployment
values and secrets out of committed files (the value still ends up in the
built site).

## Checks

`okmaps check`, `okmaps build` and the app's build stop on errors: unknown
ids, wrong types, a preset without its required fields, a default store that
isn't there, two stores with one id, a theme value that could break out of
its CSS, a secret without `allowSecrets`, an unset environment variable.
Warnings point out doubtful choices: BASE or share links without a gateway,
place tables without the geo map view, a site that can't keep maps.

## How a build uses it

`apps/frontend/okmaps.catalog.ts` maps every module id to its code. The Vite
plugin (`okmaps({ catalog, build })` from `@okmaps/config/vite`, with
`loadConfig()` from `@okmaps/config/node`) generates:

| Module | Exports |
|---|---|
| `virtual:okmaps/config` | the resolved config (secrets only with `allowSecrets`) |
| `virtual:okmaps/sources` | `sources` (SourceModule[]), `sourceTypes` (by id) |
| `virtual:okmaps/stores` | `storeTypes` |
| `virtual:okmaps/views` | `views`, `plugins` |
| `virtual:okmaps/flags` | one boolean constant per source, source type and view id |

Only the chosen modules are imported, so the rest is never bundled; the map
worker tests the flags (constants), so its left-out branches go too. A
PubMed-only knowledge-map build is about 280 kB smaller than the full site
(no Leaflet, settings page or other sources; worker 188 → 117 kB), a geo-map
only build about 900 kB.

The plugin also names and themes the pages: the title, the heading and
lead (`data-okmaps="title"` / `"lead"`), the icon and theme colour, a
`<style>` with the theme's tokens, `data-skin` and `lang` on `<html>`, and
the manifest's name. Elements with `data-okmaps-feature="<feature>"` are
left out when that feature is off.

The format is data only: any app can read a config and offer what it picks.
`resolveConfig`, the catalog of ids (`SOURCES`, `VIEWS`, `FEATURES`, …) and
`themeCss` are browser-safe (`@okmaps/config`); the configurator uses them.

## Development

    pnpm --filter @okmaps/config test
    pnpm --filter @okmaps/config typecheck
