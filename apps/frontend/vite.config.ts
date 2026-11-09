import { resolve } from "node:path";
import { loadConfig } from "@okmaps/config/node";
import { okmaps } from "@okmaps/config/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { catalog } from "./okmaps.catalog.ts";
import { serviceWorker } from "./scripts/sw-plugin.ts";

// The build config: $OKMAPS_CONFIG (a JSON file, see packages/config), else the full site.
const build = loadConfig();
const { features } = build.config;

export default defineConfig({
	base: process.env.APP_BASE ?? "/",
	build: {
		target: "es2022",
		rollupOptions: {
			input: {
				index: resolve(__dirname, "index.html"),
				map: resolve(__dirname, "map.html"),
				...(features.settingsPage ? { settings: resolve(__dirname, "settings.html") } : {}),
			},
		},
	},
	worker: { format: "es", plugins: () => [okmaps({ catalog, build, pages: false })] },
	// The workspace packages (and the fixtures the tests read) live outside this folder.
	server: { fs: { allow: [resolve(__dirname, "../..")] } },
	plugins: [
		okmaps({ catalog, build }),
		svelte(),
		...(features.offline ? [serviceWorker(resolve(__dirname, "sw/sw.ts"))] : []),
	],
});
