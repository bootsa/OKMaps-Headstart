import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// One ES module (plus lazily loaded chunks: Leaflet, citation styles), one
// CSS file and the fonts and images, with Svelte and everything else
// inside, for pages without a build step or with a framework of their own.
// Not library mode: that would inline the fonts into the CSS (0.5 MB).
export default defineConfig({
	plugins: [svelte()],
	// Tests run in jsdom: Svelte's browser build (mount), not its server one.
	resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
	base: "./",
	publicDir: false,
	build: {
		target: "es2022",
		assetsInlineLimit: 0,
		cssCodeSplit: false,
		// citation-js (Cite paper) is big but loaded only when used.
		chunkSizeWarningLimit: 700,
		rollupOptions: {
			input: resolve(__dirname, "src/bundle.ts"),
			// Keep the bundle's exports (registerSource, createMap, ...).
			preserveEntrySignatures: "strict",
			output: {
				entryFileNames: "okmaps-elements.js",
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: (asset) =>
					asset.names?.some((n) => n.endsWith(".css")) ? "okmaps-elements.css" : "assets/[name]-[hash][extname]",
			},
		},
	},
	test: {
		// The lowest coverage `pnpm coverage` accepts, a few points under today's.
		coverage: { thresholds: { lines: 83, branches: 69, functions: 72 } },
		globals: true,
		environment: "jsdom",
		setupFiles: ["./test/setup.ts"],
		include: ["test/**/*.test.ts"],
	},
});
