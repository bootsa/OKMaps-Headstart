# @okmaps/ui-svelte

The OKMaps interface, in Svelte 5 with plain CSS. It replaced `@okmaps/ui`
(React, Redux, d3 v3, jQuery, Bootstrap 3, SCSS) in 7.1.20; the app
(`apps/frontend`) draws every map with it.

What is not drawing (map processing, view types, the sources and stores
registries, settings, the interface state `MapState` and `ExplorerState`,
wording) lives in the framework-free `@okmaps/core`; the classes here of
the same names are core's made reactive for Svelte (`src/data/reactive.ts`).
This package re-exports all of it, so imports from
`@okmaps/ui-svelte` keep working. For pages that don't use Svelte,
`@okmaps/elements` wraps this interface as web components.

```
src/styles       tokens.css (design tokens), skins.css, base.css, fonts
src/components   components, each with a .stories.svelte file
src/data         Svelte reactivity for core's state classes (MapState); processing is in @okmaps/core
src/views        one folder per map view: its components (its type is in @okmaps/core)
src/docs         Storybook pages for the foundations (tokens)
test             Vitest + Testing Library
```

## Map views

A map view is one way of drawing a map: the knowledge map (`visType`
"overview"), the streamgraph ("timeline") and the geo map ("geomap"). Each is a
`MapView` (`src/views/types.ts`) in its own folder, covering both halves:

- **The view type** (`ViewType` from `@okmaps/core`, no Svelte): `id` (the
  visType), `accepts(record)` (can the record be drawn this way),
  `process({ record, papers, size, config })`, an optional `layout(map, config)`
  pass, `label`, `areas`, `places`, `overTime`, `creatable`, `strings` (i18n
  keys for the title and list) and `citation`.
- **Presentation** (here): `component` (gets `state`, `width`, `height`),
  `start(state)`, `settings` (controls for the settings panel), `overlayInset`,
  `sections` (list shortcuts) and `info` (its part of "More information").

`registerView` registers both halves (the type in `@okmaps/core`).

Shared code never names a view: it asks `state.view` (the registered view for
`config.visType`). A page registers the views it draws, and only those end up
in its bundle (the package is marked side-effect free apart from CSS):

```ts
import { knowledgeMapView, registerView } from "@okmaps/ui-svelte";
registerView(knowledgeMapView); // or registerCoreViews() for all three
```

Adding a view means writing a `MapView` and registering it; see
`test/views.test.ts` for a small one. Knowledge map themes stay a registry
inside that view (`registerTheme`). Drawing a map whose view is not
registered throws an error naming the missing visType.

## Plugins

Optional parts of the interface (share, embed, cite, PDF, info pages, the
ORCID, VIPER, Triple, CoVis and GSheets integrations) are `OkmPlugin`s
registered with `registerPlugin`, or all at once with `registerCorePlugins()`
and `registerIntegrations()`.

## Styles

Plain CSS with custom properties, nesting and cascade layers; no Sass, no CSS
framework. Components read the semantic tokens (`--color-accent`,
`--color-area-stroke`, …) and keep their own rules in scoped `<style>` blocks. A
skin is `data-skin="covis"` (or `viper`, `cris_vis`, `linkedcat`, `triple`) on
the root and only overrides tokens.

## Scripts

```
pnpm storybook        # Storybook on http://localhost:6006
pnpm build-storybook  # static Storybook in storybook-static/
pnpm test             # Vitest
pnpm typecheck        # svelte-check
```

The Pages site publishes the Storybook of the default branch at `/storybook/`.
