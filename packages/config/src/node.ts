/**
 * Reading a config file on Node (the Vite plugin, the CLI). The file is
 * JSON (okmaps.config.json). Without one the build is the full site.
 *
 * The VITE_* variables the app used before configs (VITE_GATEWAY_URL,
 * VITE_CROSSREF_MAILTO, VITE_OPENAIRE_VIA_GATEWAY, VITE_PLACE_SOURCES) still
 * work: they fill what the config leaves out.
 */
import fs from "node:fs";
import path from "node:path";
import { formatProblems, type Resolved, resolveConfig } from "./resolve.ts";
import type { OkmapsConfig } from "./types.ts";

export interface LoadedConfig extends Resolved {
	/** The config file, or undefined for the default config. */
	file?: string;
	/** The theme's CSS file's contents (theme.css), if any. */
	extraCss: string;
}

type Env = Record<string, string | undefined>;

/** The config with what the VITE_* variables say where it says nothing. */
export function withEnvDefaults(input: OkmapsConfig, env: Env): OkmapsConfig {
	const out: OkmapsConfig = structuredClone(input);
	const services = { ...out.services };
	if (services.gatewayUrl === undefined && env.VITE_GATEWAY_URL) services.gatewayUrl = env.VITE_GATEWAY_URL;
	if (services.crossrefMailto === undefined && env.VITE_CROSSREF_MAILTO)
		services.crossrefMailto = env.VITE_CROSSREF_MAILTO;
	if (services.openaireViaGateway === undefined && env.VITE_OPENAIRE_VIA_GATEWAY === "1")
		services.openaireViaGateway = true;
	if (Object.keys(services).length) out.services = services;
	if (out.sources?.places === undefined && env.VITE_PLACE_SOURCES) {
		try {
			const places = JSON.parse(env.VITE_PLACE_SOURCES);
			if (Array.isArray(places)) out.sources = { ...out.sources, places };
		} catch {
			// as before: a list that can't be read means the default table
		}
	}
	return out;
}

export class ConfigError extends Error {
	readonly file: string | undefined;
	readonly problems: Resolved["errors"];
	constructor(file: string | undefined, problems: Resolved["errors"]) {
		super(`${file ?? "The OKMaps config"} has problems:\n${formatProblems(problems)}`);
		this.file = file;
		this.problems = problems;
	}
}

/**
 * Reads and checks a config. `file` defaults to $OKMAPS_CONFIG; relative
 * paths are resolved against `cwd`. Throws ConfigError when it has errors.
 */
export function loadConfig(file?: string, options: { env?: Env; cwd?: string } = {}): LoadedConfig {
	const env = options.env ?? process.env;
	const name = file ?? env.OKMAPS_CONFIG ?? undefined;
	const abs = name ? path.resolve(options.cwd ?? process.cwd(), name) : undefined;
	let input: unknown = {};
	if (abs) {
		let text: string;
		try {
			text = fs.readFileSync(abs, "utf8");
		} catch {
			throw new ConfigError(abs, [{ path: "", message: "the file can't be read" }]);
		}
		try {
			input = JSON.parse(text);
		} catch (err) {
			throw new ConfigError(abs, [{ path: "", message: `not JSON: ${err instanceof Error ? err.message : err}` }]);
		}
	}
	const resolved =
		input && typeof input === "object" && !Array.isArray(input)
			? resolveConfig(withEnvDefaults(input as OkmapsConfig, env), { env })
			: resolveConfig(input, { env });
	if (resolved.errors.length) throw new ConfigError(abs, resolved.errors);
	let extraCss = "";
	const css = resolved.config.theme.css;
	if (css) {
		const cssFile = path.resolve(abs ? path.dirname(abs) : (options.cwd ?? process.cwd()), css);
		try {
			extraCss = fs.readFileSync(cssFile, "utf8");
		} catch {
			throw new ConfigError(abs, [{ path: "theme.css", message: `${cssFile} can't be read` }]);
		}
		if (/<\/style/i.test(extraCss))
			throw new ConfigError(abs, [{ path: "theme.css", message: "the CSS must not contain </style>" }]);
	}
	return { ...resolved, file: abs, extraCss };
}
