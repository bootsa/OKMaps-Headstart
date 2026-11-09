import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The lowest coverage `pnpm coverage` accepts, a few points under today's.
		coverage: { thresholds: { lines: 62, branches: 50, functions: 54 } },
		include: ["test/**/*.test.ts"],
		environment: "jsdom",
	},
});
