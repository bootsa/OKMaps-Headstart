/**
 * @okmaps/config: the build config of a custom OKMaps version. Browser-safe
 * (the web configurator uses it); file reading is in "./node", the Vite
 * plugin in "./vite", the wizard in src/cli.ts.
 */
export * from "./catalog.ts";
export {
	DEFAULT_CONFIG,
	DEFAULT_FEATURES,
	formatProblems,
	type Problem,
	type Resolved,
	type ResolveOptions,
	resolveConfig,
	sourceViews,
} from "./resolve.ts";
export { pageHead, themeCss, themeTokens } from "./theme.ts";
export type * from "./types.ts";

/** Types a config written in TypeScript or checked in an editor. */
export function defineConfig<T extends import("./types.ts").OkmapsConfig>(config: T): T {
	return config;
}
export { dropDefaults, type Prompt, wizard } from "./wizard.ts";
