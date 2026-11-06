// The new OKMaps interface. Import "@okmaps/ui-svelte/styles.css" once for
// the tokens and base styles, and wrap the interface in an element with the
// `okmaps` class (and data-skin for a skin).
export { default as Button } from "./components/Button.svelte";
export { default as Dialog } from "./components/Dialog.svelte";
export { default as Tag } from "./components/Tag.svelte";

export { mapConfig, type MapConfig, type Service } from "./data/config";
export { listPapers, type ListQuery } from "./data/filter";
export { processMap, resizeMap } from "./data/process";
export { MapState } from "./data/state.svelte";
export type {
  Area,
  MapContext,
  MapRecord,
  Paper,
  ProcessedMap,
  RawDocument,
} from "./data/types";
export { strings, t, type Strings } from "./i18n/strings";
