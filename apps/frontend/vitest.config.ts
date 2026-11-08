import { loadConfig } from "@okmaps/config/node";
import { okmaps } from "@okmaps/config/vite";
import { defineConfig } from "vitest/config";
import { catalog } from "./okmaps.catalog.ts";

export default defineConfig({
	// The full site's config (tests don't read $OKMAPS_CONFIG).
	plugins: [okmaps({ catalog, build: loadConfig(undefined, { env: {} }) })],
	test: {
		include: ["test/**/*.test.ts"],
		testTimeout: 60_000,
	},
});
