import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { serviceWorker } from "./scripts/sw-plugin.ts";

export default defineConfig({
	base: process.env.APP_BASE ?? "/",
	build: {
		target: "es2022",
		rollupOptions: {
			input: {
				index: resolve(__dirname, "index.html"),
				map: resolve(__dirname, "map.html"),
				settings: resolve(__dirname, "settings.html"),
			},
		},
	},
	worker: { format: "es" },
	// The workspace packages (and the fixtures the tests read) live outside this folder.
	server: { fs: { allow: [resolve(__dirname, "../..")] } },
	plugins: [svelte(), serviceWorker(resolve(__dirname, "sw/sw.ts"))],
});
