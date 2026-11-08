/**
 * The Vite plugin that builds one OKMaps version from its config.
 *
 *   import { loadConfig } from "@okmaps/config/node";
 *   import { okmaps } from "@okmaps/config/vite";
 *   const build = loadConfig(); // $OKMAPS_CONFIG, or the full site
 *   plugins: [okmaps({ catalog, build })]
 *
 * The app's catalog maps module ids to code. The plugin generates
 *   virtual:okmaps/config   the resolved config (default export)
 *   virtual:okmaps/sources  { sources, sourceTypes }  the chosen modules only
 *   virtual:okmaps/stores   { storeTypes }
 *   virtual:okmaps/views    { views, plugins }
 *   virtual:okmaps/flags    one boolean const per source, source type and
 *                           view id, for code that can't be split by module
 *                           (the map worker): `if (!flags.pubmed) throw ...`
 * so modules the config leaves out are never imported (tree-shaken). It
 * also themes and names the pages (title, heading, lead, icon, theme
 * tokens, skin) and the installed app's manifest.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { SOURCE_TYPES, SOURCES, VIEWS } from "./catalog.ts";
import type { LoadedConfig } from "./node.ts";
import { DEFAULT_CONFIG } from "./resolve.ts";
import { pageHead } from "./theme.ts";
import type { PluginId, ResolvedConfig, SourceId, SourceTypeId, StoreTypeId, ViewId } from "./types.ts";

/** One module of the catalog: `export` of `from`; with `call`, the export is called (no arguments) to make it. */
export interface ModuleRef {
	from: string;
	export: string;
	call?: boolean;
}

/** Everything an app can build, by id. A config can only choose what is here. */
export interface ModuleCatalog {
	sources: Partial<Record<SourceId, ModuleRef>>;
	sourceTypes: Partial<Record<SourceTypeId, ModuleRef>>;
	storeTypes: Partial<Record<StoreTypeId, ModuleRef>>;
	views: Partial<Record<ViewId, ModuleRef>>;
	plugins: Partial<Record<PluginId, ModuleRef>>;
}

export interface OkmapsPluginOptions {
	catalog: ModuleCatalog;
	build: LoadedConfig;
	/** Name and theme the pages and the manifest (false for a worker build). */
	pages?: boolean;
}

const PREFIX = "virtual:okmaps/";
const RESOLVED = `\0${PREFIX}`;

/** The source types a build needs: the ones people can add and the presets' types. */
export function neededSourceTypes(config: ResolvedConfig): SourceTypeId[] {
	return [...new Set([...config.sources.types, ...config.sources.presets.map((p) => p.type)])];
}

/** A module that imports the chosen entries of one catalog group. */
export function moduleCode(
	exports: { name: string; ids: string[]; group: Partial<Record<string, ModuleRef>>; byId?: boolean }[],
): string {
	const imports: string[] = [];
	const body: string[] = [];
	let n = 0;
	for (const { name, ids, group, byId } of exports) {
		const values: string[] = [];
		for (const id of ids) {
			const ref = group[id];
			if (!ref) throw new Error(`the app's catalog has no module "${id}" for ${name}`);
			const local = `m${n++}`;
			imports.push(`import { ${ref.export} as ${local} } from ${JSON.stringify(ref.from)};`);
			values.push(byId ? `${JSON.stringify(id)}: ${ref.call ? `${local}()` : local}` : ref.call ? `${local}()` : local);
		}
		body.push(
			byId
				? `export const ${name} = { ${values.join(", ")} };`
				: `export const ${name} = [${values.join(", ")}].flat();`,
		);
	}
	return `${imports.join("\n")}\n${body.join("\n")}\n`;
}

/** The config as the app gets it: without secrets unless they are allowed. */
export function publicConfig(config: ResolvedConfig): ResolvedConfig {
	if (config.allowSecrets) return config;
	const { pubmedApiKey: _, ...services } = config.services;
	return { ...config, services };
}

/** Replaces the parts of a page the config names. */
export function transformPage(html: string, build: LoadedConfig): string {
	const c = build.config;
	const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	const attr = (s: string) => esc(s).replace(/"/g, "&quot;");
	let out = html;
	// Features that are off: their elements go (one element, no nested element of its tag).
	out = out.replace(
		/<(\w+)\b[^>]*\bdata-okmaps-feature="(\w+)"[^>]*>[\s\S]*?<\/\1>\s*/g,
		(all, _tag: string, feature: string) => (c.features[feature as keyof typeof c.features] === false ? "" : all),
	);
	out = out.replace(
		/<title>([\s\S]*?)<\/title>/,
		(_, t: string) => `<title>${t.replace("Open Knowledge Maps", esc(c.site.title))}</title>`,
	);
	out = out.replace(
		/(<(\w+)\b[^>]*\bdata-okmaps="title"[^>]*>)[\s\S]*?(<\/\2>)/,
		(_, open: string, _t, close: string) =>
			`${c.theme.logo ? `<img class="okm-site-logo" src="${attr(c.theme.logo)}" alt="" />\n      ` : ""}${open}${esc(c.site.title)}${close}`,
	);
	out = out.replace(
		/(<(\w+)\b[^>]*\bdata-okmaps="lead"[^>]*>)[\s\S]*?(<\/\2>)/,
		(_, open: string, _t, close: string) => `${open}${esc(c.site.lead)}${close}`,
	);
	if (c.theme.themeColor)
		out = out.replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${attr(c.theme.themeColor)}$2`);
	if (c.theme.favicon)
		out = out.replace(
			/<link rel="icon"[^>]*>/,
			`<link rel="icon" href="${attr(c.theme.favicon)}"${c.theme.favicon.endsWith(".svg") ? ' type="image/svg+xml"' : ""} />`,
		);
	const { head, htmlAttrs } = pageHead(c, build.extraCss);
	if (head) out = out.replace("</head>", `    ${head}\n  </head>`);
	out = out.replace(/<html\b([^>]*)>/, (_, attrs: string) => {
		let a = attrs.replace(/\slang="[^"]*"/, "");
		for (const [k, v] of Object.entries(htmlAttrs)) a += ` ${k}="${attr(v)}"`;
		return `<html${a}>`;
	});
	return out;
}

/** virtual:okmaps/flags: `export const pubmed = true;` ... for every id a config can choose. */
export function flagsCode(c: ResolvedConfig): string {
	const on = new Set<string>([...c.sources.offer, ...neededSourceTypes(c), ...c.views]);
	const all = [...SOURCES, ...SOURCE_TYPES, ...VIEWS].map((x) => x.id);
	return `${all.map((id) => `export const ${id} = ${on.has(id)};`).join("\n")}\n`;
}

export function okmaps({ catalog, build, pages = true }: OkmapsPluginOptions): Plugin {
	const c = build.config;
	const modules: Record<string, () => string> = {
		config: () => `export default ${JSON.stringify(publicConfig(c))};\n`,
		flags: () => flagsCode(c),
		sources: () =>
			moduleCode([
				{ name: "sources", ids: c.sources.offer, group: catalog.sources },
				{ name: "sourceTypes", ids: neededSourceTypes(c), group: catalog.sourceTypes, byId: true },
			]),
		stores: () => moduleCode([{ name: "storeTypes", ids: c.stores.types, group: catalog.storeTypes }]),
		views: () =>
			moduleCode([
				{ name: "views", ids: c.views, group: catalog.views },
				{ name: "plugins", ids: c.plugins, group: catalog.plugins },
			]),
	};
	let publicDir = "";
	return {
		name: "okmaps-config",
		enforce: "pre",
		configResolved(resolved) {
			publicDir = resolved.publicDir;
			if (!pages) return;
			const log = resolved.logger;
			for (const w of build.warnings) log.warn(`okmaps config: ${w.path || "(config)"}: ${w.message}`);
			if (build.secrets.length)
				log.warn(
					`okmaps config: THIS BUILD CONTAINS SECRETS (${build.secrets.join(", ")}). Anyone who can open the site can read them; do not publish it.`,
				);
			if (build.file) log.info(`okmaps config: ${build.file}`);
		},
		resolveId(id) {
			if (id.startsWith(PREFIX) && id.slice(PREFIX.length) in modules) return RESOLVED + id.slice(PREFIX.length);
			return undefined;
		},
		load(id) {
			if (!id.startsWith(RESOLVED)) return undefined;
			return modules[id.slice(RESOLVED.length)]?.();
		},
		transformIndexHtml: {
			order: "pre",
			handler: (html) => (pages ? transformPage(html, build) : html),
		},
		generateBundle() {
			if (!pages) return;
			// The installed app's name and colour.
			const file = path.join(publicDir, "manifest.webmanifest");
			if (!publicDir || !fs.existsSync(file)) return;
			const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
			if (c.site.title !== DEFAULT_CONFIG.site.title) {
				manifest.name = c.site.title;
				manifest.short_name = c.site.title.slice(0, 24);
			}
			if (c.site.lead !== DEFAULT_CONFIG.site.lead) manifest.description = c.site.lead;
			manifest.lang = c.site.lang;
			if (c.theme.themeColor) manifest.theme_color = c.theme.themeColor;
			this.emitFile({
				type: "asset",
				fileName: "manifest.webmanifest",
				source: `${JSON.stringify(manifest, null, 2)}\n`,
			});
		},
	};
}
