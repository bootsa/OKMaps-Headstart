# @okmaps/elements

OKMaps for any framework, or none. Two ways in:

- **Web components**: `<okmaps-map>`, `<okmaps-search>`, `<okmaps-settings>`,
  `<okmaps-explorer>`. They work in plain HTML, React, Vue, Angular and Svelte.
- **Plain JavaScript**: `createMap`, `createSearchForm`, `createSettingsPage`,
  `createExplorer`, each returning a handle.

Both are built into one ES module and one stylesheet (`pnpm build` →
`dist/okmaps-elements.js`, `dist/okmaps-elements.css`, plus fonts, images
and lazily loaded chunks for Leaflet and citation styles). Svelte runs
inside; the page doesn't need to know. The bundle also exports all of
`@okmaps/core` (processing, registries, settings), so a page can draw
maps its own way too.

[Plain-HTML example](example/index.html) (live:
https://bootsa.github.io/OKMaps-Headstart/elements/example/).

## Plain HTML

```html
<link rel="stylesheet" href="okmaps-elements.css" />
<script type="module" src="okmaps-elements.js"></script>

<okmaps-map src="map.json" height="640"></okmaps-map>

<script type="module">
  const map = document.querySelector("okmaps-map");
  map.addEventListener("okmaps-change", (e) => console.log(e.detail.zoomedArea));
</script>
```

Loading the bundle registers every map view and the core plugins and
defines the four tags. The elements draw into themselves (no shadow
root), so the page's CSS custom properties (`--color-*`, `--font-*`),
`data-skin` and `data-scheme` style them, and the page's own CSS wins
over theirs (they sit in cascade layers).

## The elements

Attributes take strings; properties take anything (records, settings,
functions). Changing either draws the part again. Events bubble.

### `<okmaps-map>`

| | |
|---|---|
| attributes | `src` (URL of a map record), `vis-type` (`overview`, `timeline`, `geomap`, or a view you registered), `height` (px), `menu` (CSS selector of an element whose contents go in the settings panel) |
| properties | `record` (a map record; instead of `src`), `handle` (read only, see `MapHandle` below) |
| methods | `zoomIn(areaUri)`, `zoomOut()`, `selectPaper(safeId)`, `deselectPaper()` |
| events | `okmaps-ready` (detail: the `MapHandle`), `okmaps-change` (detail: a `MapSnapshot`: `zoomedArea`, `selectedPaper`, `selectedStream`, `search`, `filter`, `sort`, `listed`, `visType`), `okmaps-error` (detail: `{ error }`) |

### `<okmaps-search>`

The search form: the enabled sources' fields, the map type, where to keep
the map. Making the map is the page's job:

```js
search.addEventListener("okmaps-search", (e) => {
  const { source, request, view, title, saveTo, progress } = e.detail;
  e.detail.waitUntil(makeMap(request)); // a rejection's message is shown in the form
});
```

Attributes: `settings-href`. Properties: `settings`, `onsearch` (instead of
the event), `viewLabel`, `combine` (with it the form offers "Several
sources").

### `<okmaps-settings>`

The settings page: sources on and off, the person's own sources, map
stores. Attributes: `home` (the back link), `notice`, `notice-error`.
Properties: `settings`.

### `<okmaps-explorer>`

The saved maps drawer. Attributes: `open`, `map-href` (a template with
`{store}`, `{path}`, `{id}`; default
`map.html?store={store}&path={path}&id={id}`), `settings-href`,
`toggle="false"` (no "Your maps" button). Properties: `settings`,
`mapHref`, `openStore`, `serviceLabel`. Event: `okmaps-open-map` (detail:
`{ store, path, id }`), cancelable: `preventDefault()` to open the map
yourself.

Search, settings and explorer share one `AppSettings` per page
(`pageSettings()`, kept in localStorage) unless you give them another
through the `settings` property, so they stay in step.

## Registering sources, stores, views and plugins

Register through the bundle's own exports, so the elements see them (the
bundle carries its own copy of the registries):

```js
import { registerSource, registerStoreType, registerPlugin, creditPlugin } from "./okmaps-elements.js";

registerSource({
  id: "library",
  label: "Our library",
  fields: [{ name: "q", label: "Search terms", kind: "search", required: true }],
  request: (values, view) => ({ q: values.q, view }),
  title: (values) => String(values.q),
});
registerPlugin(creditPlugin({ faqs: "https://example.org/faq" }));
```

## Plain JavaScript

```js
import { createMap } from "./okmaps-elements.js";

const map = createMap(document.getElementById("map"), record, { visType: "overview", height: 600 });
map.on("change", (s) => console.log(s.zoomedArea, s.listed.length));
map.zoomIn(map.state.map.areas[0].uri);
map.setSearch("climate");
map.destroy();
```

`MapHandle`: `state` (read anything: `state.map.areas`, `state.listed`, …),
`snapshot()`, `zoomIn`, `zoomOut`, `selectPaper`, `deselectPaper`,
`selectStream`, `setSearch`, `setFilter`, `setSort`, `on("change", fn)`,
`destroy()`.

## In a framework

The tags are ordinary custom elements. Set objects as properties, listen
for the `okmaps-*` events.

**React 19** (sets properties on custom elements; listen with a ref):

```jsx
import { useEffect, useRef } from "react";
import "@okmaps/elements/okmaps-elements.js";
import "@okmaps/elements/okmaps-elements.css";

export function Map({ record, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const listener = (e) => onChange(e.detail);
    el.addEventListener("okmaps-change", listener);
    return () => el.removeEventListener("okmaps-change", listener);
  }, [onChange]);
  return <okmaps-map ref={ref} record={record} height="600" />;
}
```

**Vue 3** (tell the compiler about the tags: `isCustomElement: (tag) => tag.startsWith("okmaps-")`):

```vue
<okmaps-map :record.prop="record" height="600" @okmaps-change="onChange" />
```

**Angular**: add `CUSTOM_ELEMENTS_SCHEMA` to the component, then
`<okmaps-map [record]="record" (okmaps-change)="onChange($event.detail)"></okmaps-map>`.

**Svelte**: use `@okmaps/ui-svelte` directly, or the tags.

A property set before the bundle has defined the tag (common with
frameworks that render first) is picked up when the tag is defined.

## Inside this monorepo

Workspace packages that build with Vite and the Svelte plugin can import
`@okmaps/elements` from source (its `exports` point at `src/index.ts`);
then there is one copy of the registries and nothing needs the bundle.
`src/bundle.ts` is the bundle's entry: it re-exports `src/index.ts` and
registers the core views, core plugins and the tags.

## Scripts

    pnpm --filter @okmaps/elements test           # Vitest + jsdom
    pnpm --filter @okmaps/elements build          # dist/
    pnpm --filter @okmaps/elements test:browser   # the built example in headless Chromium
    pnpm --filter @okmaps/elements typecheck
