import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The lowest coverage `pnpm coverage` accepts, a few points under today's.
		coverage: { thresholds: { lines: 96, branches: 87, functions: 94 } },
		include: ["test/**/*.test.ts"],
		testTimeout: 60_000,
	},
});
