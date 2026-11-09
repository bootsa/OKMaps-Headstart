import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The lowest coverage `pnpm coverage` accepts, a few points under today's. Most of
		// core is also exercised through @okmaps/ui-svelte's tests, which count there.
		coverage: { thresholds: { lines: 55, branches: 40, functions: 50 } },
		globals: true,
		include: ["test/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
