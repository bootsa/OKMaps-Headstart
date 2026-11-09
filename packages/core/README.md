# @okmaps/core

Everything about an OKMaps map except drawing it, in plain TypeScript with
no UI framework. Use it from Svelte, React, Vue, Angular, a Web Worker,
Node, or a page without any framework.

| Part | What |
|---|---|
| `processMap(record, size)` | a map record (what `@okmaps/pipeline` makes) into papers, areas, streams and places, laid out for a chart of `size` px; `resizeMap` rescales it |
| `listPapers`, `searchWords`, `highlightParts` | the list: search, filter, sort, highlight |
| `mapTitle`, `contextItems`, `timespan` | the title and the context line |
| view types | `ViewType` = what a kind of map needs (process, layout, accepts) and how the interface talks about it (label, strings, citation, flags). `knowledgeMapType`, `streamgraphType`, `geomapType`; `registerViewType`, `getViewType`, `viewTypesFor`, `registerCoreViewTypes()` |
| sources and stores | `registerSource`, `registerSourceType`, `registerStoreType`, `allSources`, `openStore`, `FieldSpec` |
| `AppSettings` | the person's sources, stores and save target, in localStorage; a plain class with `subscribe(listener)` |
| `MapState` | the interface state of one map: zoom, selection, the list's search, filter and sort, hover, open modal; `listed` and `matching` papers worked out from them; methods `zoomIn`, `selectPaper`, `scale`, ... |
| `ExplorerState` | the saved maps explorer: folder listings (loaded lazily), open folders, create, rename, delete, move, import, export |
| `Observable` | the base of the two above: fields, `subscribe((field) => …)`, an `observe(field)` read hook, cached derived values |
| wording | `strings(language)`, `t`, `registerLanguage`, `registerLanguages` |
| `mapConfig`, `registerService` | per-service map settings |
| `applyScheme`, `initialScheme` | light or dark mode on `<html>` |

## Drawing a map your own way

```ts
import { processMap, registerCoreViewTypes } from "@okmaps/core";

registerCoreViewTypes(); // or registerViewType(...) for just the ones you draw
const map = processMap(record, 600);
for (const area of map.areas) draw(area.x, area.y, area.r, area.title);
```

The Svelte interface (`@okmaps/ui-svelte`) registers its views with
`registerView`, which also registers their types here, so a page using it
calls nothing in this package directly.

## Reactivity

Nothing here depends on a reactivity system. `MapState` and `ExplorerState`
(both `Observable`) call subscribers with the name of each field that
changed, and replace (never mutate) their objects and arrays; `AppSettings`
does the same with a plain `subscribe(listener)`. So:

- **React**: `useSyncExternalStore(state.subscribe.bind(state), () => state.zoomedArea)`.
- **Vue**: copy fields into a `shallowRef` in a subscriber.
- **Web components / plain DOM**: re-render in a subscriber.
- **Svelte**: `@okmaps/ui-svelte` overrides the `observe(field)` hook with
  one `createSubscriber` per field (`src/data/reactive.ts`), so a component
  that read `zoomedArea` updates when that field changes and not when the
  pointer moves over a paper.

```ts
import { MapState, registerCoreViewTypes } from "@okmaps/core";

registerCoreViewTypes();
const state = new MapState(record, 600);
state.subscribe((field) => {
  if (field === "zoomedArea") console.log("zoomed into", state.area?.title);
});
state.zoomIn(state.map.areas[0].uri);
console.log(state.listed.length); // the papers the list shows
```

## Rules

A test (`test/no-framework.test.ts`) fails if a file here imports Svelte,
React, Vue, Angular, Solid or Lit, uses Svelte runes, or is anything but a
`.ts` file.

## Scripts

    pnpm --filter @okmaps/core test
    pnpm --filter @okmaps/core typecheck
