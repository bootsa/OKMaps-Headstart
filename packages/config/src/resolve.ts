/**
 * Checks a config and fills in the defaults. Problems that make a build
 * wrong are errors; doubtful choices are warnings. Secrets (passwords,
 * API keys, tokens) are an error unless `allowSecrets` is set, and a
 * warning then: anyone who can open the site can read them.
 *
 * Values may name environment variables, "${env:ZOTERO_KEY}" (or with a
 * fallback, "${env:GATEWAY:-}"), so a config can be committed without its
 * secrets or per-deployment URLs; they are read at build time.
 */
import { PLUGINS, SECRET_FIELDS, SKINS, SOURCE_TYPES, SOURCES, STORE_TYPES, TYPE_FIELDS, VIEWS } from "./catalog.ts";
import type { Features, OkmapsConfig, PresetSource, PresetStore, ResolvedConfig } from "./types.ts";

export const DEFAULT_FEATURES: Features = {
	settingsPage: true,
	chooseSources: true,
	addSources: true,
	addStores: true,
	explorer: true,
	saveChoice: true,
	combine: true,
	share: true,
	schemeToggle: true,
	offline: true,
	versionLink: true,
};

/** The full site, as built without a config. */
export const DEFAULT_CONFIG: ResolvedConfig = {
	site: {
		title: "Open Knowledge Maps",
		lead: "Get an overview of a research topic. The map is made in your browser and kept where you choose.",
		lang: "en",
	},
	sources: {
		offer: SOURCES.map((s) => s.id),
		off: [],
		places: [{ preset: "aquanavi", url: "data/aquanavi.csv" }],
		types: SOURCE_TYPES.map((s) => s.id),
		presets: [],
		typePresets: {},
	},
	stores: {
		types: STORE_TYPES.map((s) => s.id),
		presets: [{ id: "browser", type: "browser", name: "This browser", config: { db: "okmaps-storage" } }],
		saveTo: "browser",
	},
	views: VIEWS.map((v) => v.id),
	plugins: PLUGINS.map((p) => p.id),
	features: DEFAULT_FEATURES,
	services: { gatewayUrl: "", openaireViaGateway: false, crossrefMailto: "" },
	theme: { scheme: "system" },
	allowSecrets: false,
};

export interface Problem {
	/** Where, e.g. "sources.presets[0].config.api_key". */
	path: string;
	message: string;
}

export interface Resolved {
	config: ResolvedConfig;
	errors: Problem[];
	warnings: Problem[];
	/** Paths of the secrets the build would contain. */
	secrets: string[];
}

export interface ResolveOptions {
	/** For "${env:NAME}" values (default process.env where there is one). */
	env?: Record<string, string | undefined>;
	/** Leave "${env:NAME}" as it is (the wizard, which writes the config back). */
	keepEnv?: boolean;
}

const TOP_KEYS = [
	"$schema",
	"site",
	"sources",
	"stores",
	"views",
	"plugins",
	"features",
	"services",
	"theme",
	"allowSecrets",
];
/** "${env:NAME}", or "${env:NAME:-fallback}" with a value for when it is not set. */
const ENV = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** A CSS value without anything that could close the rule or the <style>. */
const SAFE_CSS = /^[^;{}<>]*$/;

function defaultEnv(): Record<string, string | undefined> {
	const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
	return p?.env ?? {};
}

/** Replaces "${env:NAME}" everywhere in the config's strings. */
function substitute(v: unknown, env: Record<string, string | undefined>, path: string, errors: Problem[]): unknown {
	if (typeof v === "string")
		return v.replace(ENV, (_, name: string, fallback?: string) => {
			const value = env[name] ?? fallback;
			if (value === undefined) errors.push({ path, message: `environment variable ${name} is not set` });
			return value ?? "";
		});
	if (Array.isArray(v)) return v.map((x, i) => substitute(x, env, `${path}[${i}]`, errors));
	if (isObj(v))
		return Object.fromEntries(
			Object.entries(v).map(([k, x]) => [k, substitute(x, env, path ? `${path}.${k}` : k, errors)]),
		);
	return v;
}

/** Checks the config and fills in the defaults. */
export function resolveConfig(input: unknown, options: ResolveOptions = {}): Resolved {
	const errors: Problem[] = [];
	const warnings: Problem[] = [];
	const secrets: string[] = [];
	if (!isObj(input)) {
		errors.push({ path: "", message: "the config must be a JSON object" });
		return { config: structuredClone(DEFAULT_CONFIG), errors, warnings, secrets };
	}
	const raw = (options.keepEnv ? input : substitute(input, options.env ?? defaultEnv(), "", errors)) as OkmapsConfig;
	for (const k of Object.keys(raw))
		if (!TOP_KEYS.includes(k)) warnings.push({ path: k, message: `unknown setting "${k}" (ignored)` });

	const c = structuredClone(DEFAULT_CONFIG);
	const section = <K extends keyof OkmapsConfig>(k: K): NonNullable<OkmapsConfig[K]> | undefined => {
		const v = raw[k];
		if (v === undefined) return undefined;
		if (k !== "views" && k !== "plugins" && k !== "allowSecrets" && !isObj(v)) {
			errors.push({ path: k, message: "must be an object" });
			return undefined;
		}
		return v as NonNullable<OkmapsConfig[K]>;
	};
	const str = (v: unknown, path: string): string | undefined => {
		if (v === undefined) return undefined;
		if (typeof v !== "string") {
			errors.push({ path, message: "must be text" });
			return undefined;
		}
		return v;
	};
	const bool = (v: unknown, path: string): boolean | undefined => {
		if (v === undefined) return undefined;
		if (typeof v !== "boolean") {
			errors.push({ path, message: "must be true or false" });
			return undefined;
		}
		return v;
	};
	/** A list of known ids, each once. */
	const ids = <T extends string>(v: unknown, known: { id: T }[], path: string): T[] | undefined => {
		if (v === undefined) return undefined;
		if (!Array.isArray(v)) {
			errors.push({ path, message: "must be a list" });
			return undefined;
		}
		const ok = new Set(known.map((k) => k.id));
		const out: T[] = [];
		v.forEach((x, i) => {
			if (typeof x !== "string" || !ok.has(x as T))
				errors.push({ path: `${path}[${i}]`, message: `unknown: ${JSON.stringify(x)} (one of ${[...ok].join(", ")})` });
			else if (!out.includes(x as T)) out.push(x as T);
		});
		return out;
	};
	const strings = (v: unknown, path: string): Record<string, string> => {
		if (!isObj(v)) {
			errors.push({ path, message: "must be an object of texts" });
			return {};
		}
		const out: Record<string, string> = {};
		for (const [k, x] of Object.entries(v)) {
			if (typeof x === "string") out[k] = x;
			else if (typeof x === "number" || typeof x === "boolean") out[k] = String(x);
			else errors.push({ path: `${path}.${k}`, message: "must be text" });
		}
		return out;
	};

	// site
	const site = section("site");
	if (site) {
		c.site.title = str(site.title, "site.title") ?? c.site.title;
		c.site.lead = str(site.lead, "site.lead") ?? c.site.lead;
		c.site.lang = str(site.lang, "site.lang") ?? c.site.lang;
		if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(c.site.lang) && !c.site.lang.includes("${env:"))
			errors.push({ path: "site.lang", message: "must be a language tag such as en or de-AT" });
	}

	// sources
	const sources = section("sources");
	if (sources) {
		c.sources.offer = ids(sources.offer, SOURCES, "sources.offer") ?? c.sources.offer;
		c.sources.types = ids(sources.types, SOURCE_TYPES, "sources.types") ?? c.sources.types;
		if (sources.off !== undefined) {
			if (Array.isArray(sources.off) && sources.off.every((x) => typeof x === "string")) c.sources.off = sources.off;
			else errors.push({ path: "sources.off", message: "must be a list of source ids" });
		}
		if (sources.places !== undefined) {
			if (!Array.isArray(sources.places)) errors.push({ path: "sources.places", message: "must be a list" });
			else {
				c.sources.places = [];
				sources.places.forEach((p, i) => {
					const path = `sources.places[${i}]`;
					if (!isObj(p) || typeof p.url !== "string" || !p.url) return errors.push({ path, message: "needs a url" });
					if (p.preset !== undefined && p.preset !== "aquanavi")
						errors.push({ path: `${path}.preset`, message: 'only "aquanavi" is known' });
					if (p.preset === undefined && !isObj(p.mapping))
						errors.push({ path: `${path}.mapping`, message: "needs a mapping (columns) or a preset" });
					if (p.format !== undefined && p.format !== "csv" && p.format !== "json")
						errors.push({ path: `${path}.format`, message: 'must be "csv" or "json"' });
					if (p.id !== undefined && (typeof p.id !== "string" || !ID.test(p.id)))
						errors.push({ path: `${path}.id`, message: "must be letters, digits, - and _" });
					c.sources.places.push(p);
				});
			}
		}
		if (sources.presets !== undefined) {
			if (!Array.isArray(sources.presets)) errors.push({ path: "sources.presets", message: "must be a list" });
			else c.sources.presets = sources.presets.flatMap((p, i) => preset(p, `sources.presets[${i}]`, "source"));
		}
		if (sources.typePresets !== undefined) {
			if (!isObj(sources.typePresets))
				errors.push({ path: "sources.typePresets", message: "must be an object by source type" });
			else
				for (const [type, list] of Object.entries(sources.typePresets)) {
					const path = `sources.typePresets.${type}`;
					if (!SOURCE_TYPES.some((t) => t.id === type)) {
						errors.push({ path, message: `unknown source type "${type}"` });
						continue;
					}
					if (!Array.isArray(list)) {
						errors.push({ path, message: "must be a list" });
						continue;
					}
					c.sources.typePresets[type as keyof typeof c.sources.typePresets] = list.flatMap((p, i) => {
						if (!isObj(p) || typeof p.id !== "string" || typeof p.label !== "string") {
							errors.push({ path: `${path}[${i}]`, message: "needs an id, a label and a config" });
							return [];
						}
						const config = strings(p.config ?? {}, `${path}[${i}].config`);
						secretsIn(type, config, `${path}[${i}].config`);
						return [{ id: p.id, label: p.label, description: str(p.description, `${path}[${i}].description`), config }];
					});
				}
		}
	}

	function secretsIn(type: string, config: Record<string, string>, path: string) {
		for (const field of SECRET_FIELDS[type] ?? []) if (config[field]) secrets.push(`${path}.${field}`);
	}

	function preset(p: unknown, path: string, kind: "source"): PresetSource[];
	function preset(p: unknown, path: string, kind: "store"): PresetStore[];
	function preset(p: unknown, path: string, kind: "source" | "store"): (PresetSource | PresetStore)[] {
		const known = kind === "source" ? SOURCE_TYPES : STORE_TYPES;
		if (!isObj(p)) {
			errors.push({ path, message: "must be an object" });
			return [];
		}
		const ok = typeof p.id === "string" && ID.test(p.id);
		if (!ok) errors.push({ path: `${path}.id`, message: "needs an id of letters, digits, - and _" });
		if (!known.some((t) => t.id === p.type))
			errors.push({
				path: `${path}.type`,
				message: `unknown ${kind} type ${JSON.stringify(p.type)} (one of ${known.map((t) => t.id).join(", ")})`,
			});
		if (typeof p.name !== "string" || !p.name) errors.push({ path: `${path}.name`, message: "needs a name" });
		const config = strings(p.config ?? {}, `${path}.config`);
		secretsIn(String(p.type), config, `${path}.config`);
		for (const f of TYPE_FIELDS[p.type as keyof typeof TYPE_FIELDS] ?? [])
			if (f.required && !config[f.name])
				errors.push({ path: `${path}.config.${f.name}`, message: `needs ${f.label.toLowerCase()}` });
		if (!ok) return [];
		return [
			{
				id: p.id as string,
				type: p.type,
				name: String(p.name ?? p.id),
				...(kind === "source" && typeof p.description === "string" ? { description: p.description } : {}),
				config,
			} as PresetSource | PresetStore,
		];
	}

	// stores
	const stores = section("stores");
	if (stores) {
		c.stores.types = ids(stores.types, STORE_TYPES, "stores.types") ?? c.stores.types;
		if (stores.presets !== undefined) {
			if (!Array.isArray(stores.presets)) errors.push({ path: "stores.presets", message: "must be a list" });
			else c.stores.presets = stores.presets.flatMap((p, i) => preset(p, `stores.presets[${i}]`, "store"));
		} else {
			// The default "This browser" store only when browser stores are offered.
			c.stores.presets = c.stores.presets.filter((p) => c.stores.types.includes(p.type));
		}
		const saveTo = str(stores.saveTo, "stores.saveTo");
		c.stores.saveTo = saveTo ?? c.stores.presets[0]?.id ?? "none";
	}

	c.views = ids(section("views"), VIEWS, "views") ?? c.views;
	c.plugins = ids(section("plugins"), PLUGINS, "plugins") ?? c.plugins;

	// features
	const features = section("features");
	if (features)
		for (const [k, v] of Object.entries(features)) {
			if (!(k in DEFAULT_FEATURES)) {
				warnings.push({ path: `features.${k}`, message: `unknown feature "${k}" (ignored)` });
				continue;
			}
			const b = bool(v, `features.${k}`);
			if (b !== undefined) c.features[k as keyof Features] = b;
		}

	// services
	const services = section("services");
	if (services) {
		c.services.gatewayUrl = str(services.gatewayUrl, "services.gatewayUrl") ?? "";
		c.services.openaireViaGateway = bool(services.openaireViaGateway, "services.openaireViaGateway") ?? false;
		c.services.crossrefMailto = str(services.crossrefMailto, "services.crossrefMailto") ?? "";
		const key = str(services.pubmedApiKey, "services.pubmedApiKey");
		if (key) {
			c.services.pubmedApiKey = key;
			secrets.push("services.pubmedApiKey");
		}
		if (
			c.services.gatewayUrl &&
			!/^https?:\/\//.test(c.services.gatewayUrl) &&
			!c.services.gatewayUrl.includes("${env:")
		)
			errors.push({ path: "services.gatewayUrl", message: "must be an http(s) URL" });
	}

	// theme
	const theme = section("theme");
	if (theme) {
		for (const k of ["accent", "heading", "font", "fontStylesheet", "css", "logo", "favicon", "themeColor"] as const) {
			const v = str(theme[k], `theme.${k}`);
			if (v === undefined) continue;
			if (!SAFE_CSS.test(v) || v.includes('"'))
				errors.push({ path: `theme.${k}`, message: 'must not contain ; { } < > or "' });
			else c.theme[k] = v;
		}
		if (theme.skin !== undefined) {
			if (SKINS.some((s) => s.id === theme.skin)) c.theme.skin = theme.skin;
			else errors.push({ path: "theme.skin", message: `unknown skin (one of ${SKINS.map((s) => s.id).join(", ")})` });
		}
		if (theme.scheme !== undefined) {
			if (theme.scheme === "system" || theme.scheme === "light" || theme.scheme === "dark")
				c.theme.scheme = theme.scheme;
			else errors.push({ path: "theme.scheme", message: 'must be "system", "light" or "dark"' });
		}
		for (const k of ["tokens", "darkTokens"] as const) {
			if (theme[k] === undefined) continue;
			const t = strings(theme[k], `theme.${k}`);
			for (const [name, value] of Object.entries(t)) {
				if (!/^--[A-Za-z0-9-]+$/.test(name))
					errors.push({ path: `theme.${k}.${name}`, message: "a token is a CSS custom property, e.g. --color-accent" });
				else if (!SAFE_CSS.test(value))
					errors.push({ path: `theme.${k}.${name}`, message: "must not contain ; { } < or >" });
			}
			c.theme[k] = t;
		}
	}

	c.allowSecrets = bool(section("allowSecrets"), "allowSecrets") ?? false;

	// What goes together.
	if (c.sources.offer.length === 0 && c.sources.presets.length === 0 && c.sources.types.length === 0)
		errors.push({ path: "sources", message: "the site offers no sources and people cannot add any" });
	if (c.views.length === 0) errors.push({ path: "views", message: "needs at least one view" });
	if (c.sources.offer.includes("places") && !c.views.includes("geomap"))
		warnings.push({ path: "sources.offer", message: '"places" makes geo maps, but the "geomap" view is not built' });
	if (c.sources.offer.includes("places") && c.sources.places.length === 0)
		warnings.push({ path: "sources.places", message: '"places" is offered but there are no place tables' });
	if (!c.views.includes("overview"))
		warnings.push({
			path: "views",
			message: "without the knowledge map (overview) only streamgraphs and geo maps are made",
		});
	if (c.sources.offer.includes("base") && !c.services.gatewayUrl)
		warnings.push({
			path: "sources.offer",
			message: "BASE needs services.gatewayUrl; without it, it shows as unavailable",
		});
	if (c.features.share && !c.services.gatewayUrl)
		warnings.push({
			path: "features.share",
			message: "share links need services.gatewayUrl; without it there are none",
		});
	if (c.features.addSources && c.sources.types.length === 0) c.features.addSources = false;
	if (c.stores.types.length === 0) errors.push({ path: "stores.types", message: "needs at least one store type" });
	c.stores.presets.forEach((p, i) => {
		if (!c.stores.types.includes(p.type))
			errors.push({ path: `stores.presets[${i}].type`, message: `"${p.type}" is not in stores.types` });
	});
	const storeIds = c.stores.presets.map((p) => p.id);
	if (new Set(storeIds).size !== storeIds.length)
		errors.push({ path: "stores.presets", message: "two stores have the same id" });
	const sourceIds = c.sources.presets.map((p) => `${p.type}:${p.id}`);
	if (new Set(sourceIds).size !== sourceIds.length)
		errors.push({ path: "sources.presets", message: "two sources of one type have the same id" });
	if (c.stores.saveTo !== "none" && !storeIds.includes(c.stores.saveTo))
		errors.push({
			path: "stores.saveTo",
			message: `"${c.stores.saveTo}" is not a store in stores.presets (or "none")`,
		});
	if (c.stores.presets.length === 0 && !c.features.addStores && c.stores.saveTo === "none")
		warnings.push({ path: "stores", message: "no stores and people cannot add any: maps can't be kept" });

	if (secrets.length) {
		const message = "is a secret: anyone who can open the site can read it";
		if (c.allowSecrets) for (const path of secrets) warnings.push({ path, message });
		else
			for (const path of secrets)
				errors.push({ path, message: `${message}. Leave it out, or set "allowSecrets": true for a private site` });
	}
	return { config: c, errors, warnings, secrets };
}

/** The view ids a source makes. */
export function sourceViews(id: string): string[] {
	if (id === "places") return ["geomap"];
	if (id === "openaire") return ["overview"];
	return ["overview", "timeline"];
}

/** One line per problem, for the terminal. */
export function formatProblems(problems: Problem[]): string {
	return problems.map((p) => `  ${p.path || "(config)"}: ${p.message}`).join("\n");
}
