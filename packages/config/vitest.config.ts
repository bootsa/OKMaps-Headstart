import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The lowest coverage `pnpm coverage` accepts, a few points under today's (cli.ts is the untested part).
		coverage: { thresholds: { lines: 78, branches: 70, functions: 75 } },
		include: ["test/**/*.test.ts"],
		testTimeout: 60_000,
	},
});
