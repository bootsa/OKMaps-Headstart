# @okmaps/ui

The map visualisation: the knowledge map, the streamgraph and the geo map,
with the list, filters and modals around them. React 18 with Redux, d3 and
SCSS (Bootstrap 3), built by webpack into the `headstart` bundle, which
exposes `headstart.start()` and reads its settings from the `data_config`
global.

`apps/frontend` builds it (`pnpm build:vis` there) and loads the bundle on
its map page, in the `local_files` mode, so this package has no page of its
own.

```
src/index.ts, src/app.ts   the bundle's entry (headstart.start)
src/js/components          React components connected to the Redux store
src/js/templates           presentational components
src/js/reducers, actions, middleware   the Redux store
src/js/dataprocessing      turning a map record into what the views draw
src/stylesheets            SCSS
src/test                   Vitest tests (see src/test/README.md)
```

## Scripts

```
pnpm build        # production bundle in dist/ (dist/headstart.php lists its tags)
pnpm dev          # development build, rebuilt on change
pnpm test         # Vitest (TZ=Europe/Vienna, which one test needs)
pnpm typecheck
pnpm eslint:check # not clean yet, and not in CI
```
