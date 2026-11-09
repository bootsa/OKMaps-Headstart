/**
 * The configurator's state: the config being made, with every default
 * filled in (so each control has a value), and what the page shows from
 * it: the file, its problems and the commands that build it.
 */
import {
	DEFAULT_CONFIG,
	dropDefaults,
	type OkmapsConfig,
	type Resolved,
	type ResolvedConfig,
	resolveConfig,
	themeTokens,
} from "@okmaps/config";

export type State = ResolvedConfig;

/** A fresh state: the full site. */
export const freshState = (): State => structuredClone(DEFAULT_CONFIG);

/** A state from a config file's contents ("${env:...}" kept as written). */
export function stateFrom(text: string): { state: State; errors: string[] } {
	let input: unknown;
	try {
		input = JSON.parse(text);
	} catch (err) {
		return { state: freshState(), errors: [`Not JSON: ${err instanceof Error ? err.message : err}`] };
	}
	const r = resolveConfig(input, { keepEnv: true });
	return { state: r.config, errors: r.errors.map((e) => `${e.path || "(config)"}: ${e.message}`) };
}

/** The config file for a state: only what differs from the full site. */
export function configOf(state: State): OkmapsConfig {
	const c: OkmapsConfig = structuredClone(state);
	if (!c.sources?.offer?.includes("places")) delete c.sources?.places;
	if (!c.sources?.presets?.length) delete c.sources?.presets;
	if (!c.sources?.off?.length) delete c.sources?.off;
	if (c.sources?.typePresets && !Object.keys(c.sources.typePresets).length) delete c.sources.typePresets;
	if (c.theme)
		for (const [k, v] of Object.entries(c.theme)) if (v === "" || v === undefined) delete c.theme[k as never];
	if (c.theme?.tokens && !Object.keys(c.theme.tokens).length) delete c.theme.tokens;
	if (c.theme?.darkTokens && !Object.keys(c.theme.darkTokens).length) delete c.theme.darkTokens;
	if (c.services && !c.services.pubmedApiKey) delete c.services.pubmedApiKey;
	return dropDefaults(c);
}

export function fileText(state: State): string {
	return `${JSON.stringify({ $schema: SCHEMA_URL, ...configOf(state) }, null, "\t")}\n`;
}

/** The schema on GitHub, for editors. */
export const SCHEMA_URL = "https://raw.githubusercontent.com/bootsa/OKMaps-Headstart/main/packages/config/schema.json";

/** The checks a build would make; "${env:...}" values count as set. */
export function check(state: State): Resolved {
	return resolveConfig(configOf(state), { keepEnv: true });
}

/** A file name from the site's title: "lab-maps.okmaps.json". */
export function fileName(state: State): string {
	const stem = state.site.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	return `${stem || "okmaps"}.okmaps.json`;
}

/** The commands that check and build it, from the repository's root. */
export function commands(state: State): string[] {
	const file = `configs/${fileName(state)}`;
	return [
		`pnpm okmaps check ${file}`,
		`pnpm okmaps build ${file} --out dist-${fileName(state).replace(".okmaps.json", "")}`,
	];
}

/** The tokens a preview in `scheme` gets (colours are the light scheme's unless darkTokens give them). */
export function previewTokens(state: State, scheme: "light" | "dark"): Record<string, string> {
	const all = themeTokens(state.theme);
	if (scheme === "dark")
		return {
			...Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith("--color-"))),
			...state.theme.darkTokens,
		};
	return all;
}
