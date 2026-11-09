/**
 * The ready-made bundle (dist/okmaps-elements.js): every view, the core
 * plugins and the tags, as soon as it loads.
 *
 *   <link rel="stylesheet" href="okmaps-elements.css">
 *   <script type="module" src="okmaps-elements.js"></script>
 *   <okmaps-map src="map.json"></okmaps-map>
 *
 * Sources, store types and deployment plugins (share, credit, ...) are the
 * page's to register, through this module's exports:
 *
 *   import { registerSource } from "./okmaps-elements.js";
 */
import { defineElements, registerCorePlugins, registerCoreViews } from "./index";

export * from "./index";

registerCoreViews();
registerCorePlugins();
if (typeof customElements !== "undefined") defineElements();
