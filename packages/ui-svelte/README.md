# @okmaps/ui-svelte

The new OKMaps interface, in Svelte 5 with plain CSS. It is being written to
replace `@okmaps/ui` (React, Redux, d3 v3, jQuery, Bootstrap 3, SCSS); until it
matches that package's behaviour, the app keeps loading the old one.

```
src/styles       tokens.css (design tokens), skins.css, base.css, fonts
src/components   components, each with a .stories.svelte file
src/docs         Storybook pages for the foundations (tokens)
test             Vitest + Testing Library
```

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
