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

Nothing here depends on a reactivity system. `AppSettings` tells
subscribers about every change and replaces (never mutates) its arrays, so
it fits React's `useSyncExternalStore`, Vue's `shallowRef`, or Svelte's
`createSubscriber` (which is what `@okmaps/ui-svelte`'s `AppSettings` does,
through the `observe()` hook).

## Rules

A test (`test/no-framework.test.ts`) fails if a file here imports Svelte,
React, Vue, Angular, Solid or Lit, uses Svelte runes, or is anything but a
`.ts` file.

## Scripts

    pnpm --filter @okmaps/core test
    pnpm --filter @okmaps/core typecheck
