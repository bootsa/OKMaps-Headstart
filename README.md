# Head Start

Head Start is a web-based knowledge mapping software intended to give anyone a head start on their literature search (hence the name). It makes knowledge maps from a variety of data sources, in the browser.

![Head Start](headstart.png)

## How it is built

Maps are made in the browser. A search goes straight to the provider (or
through a small gateway where the provider needs one), the map is computed
in a Web Worker, and the person's maps are kept where they choose: in the
browser, WebDAV folders, Solid Pods or Atomic Data servers. It works
offline once installed as a web app.

| Folder | What |
|---|---|
| `apps/frontend` | the browser app (Vite): search page, map page and settings page, the worker that makes maps, share links, offline use |
| `apps/configurator` | the web configurator for custom versions: pick what a version offers and how it looks, get its config file |
| `packages/config` | build configs of custom versions (`okmaps.config.json`): the format and its checks, the Vite plugin that builds only what a config picks, the `pnpm okmaps` wizard |
| `packages/pipeline` | turns records into a map: clustering, layout, area titles, the streamgraph step (a TypeScript port of the R scripts) |
| `packages/sources` | the metadata sources: PubMed, BASE, OpenAIRE, OpenAlex, Zenodo, Zotero, any SPARQL endpoint (Wikidata, DBpedia presets), place tables for geo maps, and Crossref citation counts |
| `packages/storage` | where maps are kept: one interface, an adaptor per storage system (this browser, WebDAV, Solid Pod, Atomic Data), and the folder tree the map explorer uses |
| `packages/gateway` | the small server some providers need (BASE's registered IP and key) and the store for share links |
| `packages/core` | everything about a map except drawing it, with no UI framework: processing records into areas, papers, streams and places, the view types, the sources and stores registries, the person's settings, wording |
| `packages/ui-svelte` | the interface in Svelte 5 and plain CSS: the map views (knowledge map, streamgraph, geo map), search form, settings page and map explorer, with its Storybook |
| `packages/elements` | OKMaps for any framework, or none: web components (`<okmaps-map>`, `<okmaps-search>`, `<okmaps-settings>`, `<okmaps-explorer>`) and a plain JavaScript API, built into one JS and one CSS file, with a plain-HTML example |

The parts are registered modules, so a deployment includes only what it
needs: map views with `registerView`, metadata sources with `registerSource`
and `registerSourceType`, kinds of store with `registerStoreType` (from
`@okmaps/core`; `@okmaps/ui-svelte` and `@okmaps/elements` export them too). On the settings page a person turns sources on or off,
adds their own (an OpenAlex key, a Zotero library, a SPARQL endpoint, …) and
sets up as many stores as they like; the search form shows the fields of the
enabled sources and asks where to save the new map.

No UI framework is required to use OKMaps. `@okmaps/core` is plain
TypeScript, so a React, Vue or Angular page can draw maps its own way, and
`@okmaps/elements` puts the ready-made interface on any page as HTML tags:

    <link rel="stylesheet" href="okmaps-elements.css">
    <script type="module" src="okmaps-elements.js"></script>
    <okmaps-map src="map.json"></okmaps-map>

See [packages/elements/README.md](packages/elements/README.md) and the
[plain-HTML example](https://bootsa.github.io/OKMaps-Headstart/elements/example/).
### Custom versions

Different projects can build their own version from one config file: which
sources, stores, map views and plugins it offers, ready-made sources (a
project's Zotero group, a Zenodo community) and stores, settings for the
services, which features people get (settings page, own sources, sharing,
…) and the look (title, colours, fonts, logo, skin, light or dark). Only the
chosen parts are built into the site.

    pnpm okmaps configure configs/my-project.json   # answer the questions
    pnpm okmaps build configs/my-project.json       # the site in dist-my-project/

The [configurator](https://bootsa.github.io/OKMaps-Headstart/configure/)
makes the same file in the browser, and the "Custom build" workflow builds a
committed one on GitHub. See [packages/config](packages/config/README.md).

It is a [pnpm](https://pnpm.io/) workspace (Node 22.18 or newer, CI and the gateway image use Node 26; `corepack enable`
gives you the pnpm version in `package.json`). Each package has a README with
how to run and test it. From the repository root:

    pnpm install
    pnpm test            # every package's tests
    pnpm coverage        # the same, with coverage per package; fails below each
                         # package's minimum (coverage.thresholds in its vitest config)
    pnpm typecheck
    pnpm lint            # Biome: lint and format check (pnpm lint:fix to apply)
    pnpm build           # the app into apps/frontend/dist
    pnpm dev             # the app with hot reload
    pnpm test:browser    # the built app in headless Chromium
    pnpm okmaps          # custom versions: configure, check, print, build

Run one package's scripts with `pnpm --filter @okmaps/<name> <script>`.

[Biome](https://biomejs.dev/) lints and formats the code (`biome.json`). In
`.svelte` files it uses Biome's experimental full Svelte support, and
`svelte-check` stays in charge of types and accessibility warnings.

The app is published to GitHub Pages by `.github/workflows/pages.yml`:
`latest/` follows `main`, and each release stays available at its own path
(`v7.0.0/`, …), listed on `versions.html`.

### Releases

Releases are made by release-please (`.github/workflows/release.yml`). It
keeps a release PR open with the next version number and changelog, worked
out from commit messages in the [Conventional Commits](https://www.conventionalcommits.org/)
form: `feat: …` (new feature, minor version), `fix: …` (patch), `feat!: …`
(breaking change, major version); other types such as `docs:` or `chore:`
are not released on their own. Merging the release PR updates the version in
`package.json` and `CHANGELOG.md`, tags the release and publishes it.

The earlier server (PHP, R and Python workers, Postgres, Redis, Docker
setup) is on the [`legacy-server`](https://github.com/bootsa/OKMaps-Headstart/tree/legacy-server) branch.
Code comments that name `server/…` files or R functions point there.

The tests compare against saved outputs ("goldens") of that old code. The R
and Python scripts that made them ran the old code and were removed together
with the `legacy/` folder after commit `ec6a09b`; check out that commit to
make the goldens again.

### Interface tests and Storybook

    pnpm --filter @okmaps/ui-svelte test
    pnpm --filter @okmaps/ui-svelte storybook

## Contributors

Maintainer: [Christopher Kittel](https://github.com/chreman) ([christopher.kittel@openknowledgemaps.org](mailto:christopher.kittel@openknowledgemaps.org)), [Maxi Schramm](https://github.com/tanteuschi) ([maxi@openknowledgemaps.org](mailto:maxi@openknowledgemaps.org)), and [Peter Kraker](https://github.com/pkraker) ([pkraker@openknowledgemaps.org](mailto:pkraker@openknowledgemaps.org))

Authors: [Thomas Arrow](https://github.com/tarrow), [Andrei Shket](https://github.com/andreishket), [Sergey Krutilin](https://github.com/modsen-hedgehog), [Alexandra Shubenko](https://github.com/vrednyydragon), [Jan Konstant](https://github.com/konstiman), [Asura Enkhbayar](https://github.com/Bubblbu), [Scott Chamberlain](https://github.com/sckott), [Rainer Bachleitner](https://github.com/rbachleitner), [Yael Stein](https://github.com/jaels), [Mike Skaug](https://github.com/mikeskaug), [Philipp Weissensteiner](https://github.com/wpp), and the [Open Knowledge Maps team](http://openknowledgemaps.org/team)

## Showcases

* [Open Knowledge Maps Search](https://openknowledgemaps.org/): Creates a visualisation on the fly based on a user's search in either BASE or PubMed.
* [OKMaps Custom Services](https://openknowledgemaps.org/custom): Enable third parties to embed customisable search components and visualisations.
* [VisConnect](https://openknowledgemaps.org/visconnect): Provides an interactive visual profile of a researcher’s work.

## Browser compatibility

The frontend has been successfully tested with Chrome, Firefox, Safari and Microsoft Edge. Unfortunately, Internet Explorer is not supported due to the fact that it is not possible to insert HTML into a foreignObject.

## Background

More information can be found in the following papers:

Kraker, P., Beardmore, L., Hemila, M., Johann, D., Kaczmirek, L. & Schubert, C. (2024). [Partizipative Modelle im Zusammenspiel von Bibliotheken und KI-Systemen: Drei Fallstudien zur Integration der visuellen Recherche-Plattform Open Knowledge Maps](https://www.b-i-t-online.de/heft/2024-04-fachbeitrag-kraker.pdf). B.I.T. Online,  27(4), 327-335.

Kraker, P., Goyal, G., Schramm, M., Akin, J., & Kittel, C. (2021). [CoVis: A curated, collaborative & visual knowledge base for COVID-19 research](https://doi.org/10.5281/zenodo.4586079). Zenodo. doi: 10.5281/zenodo.4586079

Kraker, P., Schramm, M., Kittel, C., Chamberlain, S., & Arrow, T. (2018). [VIPER: The Visual Project Explorer](https://zenodo.org/record/1248119). Zenodo. doi:10.5281/zenodo.2587129

Kraker, P., Kittel, C., & Enkhbayar, A. (2016). [Open Knowledge Maps: Creating a Visual Interface to the World’s Scientific Knowledge Based on Natural Language Processing](https://doi.org/10.12685/027.7-4-2-157). 027.7 Journal for Library Culture, 4(2), 98–103. doi:10.12685/027.7-4-2-157

Kraker, P., Schlögl, C. , Jack, K. & Lindstaedt, S. (2015). [Visualization of Co-Readership Patterns from an Online Reference Management System](http://arxiv.org/abs/1409.0348). Journal of Informetrics, 9(1), 169–182. doi:10.1016/j.joi.2014.12.003

Kraker, P., Körner, C., Jack, K., & Granitzer, M. (2012). [Harnessing User Library Statistics for Research Evaluation and Knowledge Domain Visualization](http://know-center.tugraz.at/download_extern/papers/user_library_statistics.pdf). Proceedings of the 21st International Conference Companion on World Wide Web (pp. 1017–1024). Lyon: ACM. doi:10.1145/2187980.2188236


## License
Head Start is licensed under [MIT](LICENSE).

## Funding
<img src="https://raw.githubusercontent.com/OpenKnowledgeMaps/CoVis/master/img/EU-flag_small-270x183.png" width="60"> 

This project has received funding from the European Union's Horizon 2020 and Horizon Europe research and innovation programmes, under grant agreement nos. 831644, 863420, and 101129751.
