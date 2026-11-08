import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [svelte(), svelteTesting()],
	test: {
		// The lowest coverage `pnpm coverage` accepts, a few points under today's.
		coverage: { thresholds: { lines: 90, branches: 70, functions: 88 } },
		globals: true,
		environment: "jsdom",
		setupFiles: ["./test/setup.ts"],
		include: ["src/**/*.test.ts", "test/**/*.test.ts"],
	},
});
