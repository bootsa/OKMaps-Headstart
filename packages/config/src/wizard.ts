/**
 * The interactive wizard (okmaps configure): asks what the version should
 * offer and returns the config. It starts from an existing config, so
 * running it again changes one.
 *
 * Questions go through `Prompt`, so tests (and other front ends) can answer
 * them; cli.ts answers them in the terminal.
 */
import {
	type Choice,
	FEATURES,
	PLUGINS,
	SECRET_FIELDS,
	SKINS,
	SOURCE_TYPES,
	SOURCES,
	STORE_TYPES,
	TYPE_FIELDS,
	VIEWS,
} from "./catalog.ts";
import { DEFAULT_CONFIG, resolveConfig } from "./resolve.ts";
import type {
	OkmapsConfig,
	PresetSource,
	PresetStore,
	SchemeChoice,
	SkinId,
	SourceTypeId,
	StoreTypeId,
} from "./types.ts";

export interface Prompt {
	/** Asks one question; the answer, "" for the default. */
	ask(question: string): Promise<string>;
	print(text: string): void;
}

/** Up to `limit` questions; the wizard gives up on a script that never ends. */
const LIMIT = 500;

export async function wizard(io: Prompt, start: OkmapsConfig = {}): Promise<OkmapsConfig> {
	let asked = 0;
	const ask = async (q: string) => {
		if (++asked > LIMIT) throw new Error("too many questions");
		return (await io.ask(q)).trim();
	};
	const base = resolveConfig(start, { keepEnv: true }).config;

	const text = async (q: string, current: string) => {
		const a = await ask(`${q}${current ? ` [${current}]` : ""}: `);
		return a === "-" ? "" : a || current;
	};
	const yes = async (q: string, current: boolean) => {
		for (;;) {
			const a = (await ask(`${q} (${current ? "Y/n" : "y/N"}): `)).toLowerCase();
			if (!a) return current;
			if (["y", "yes", "j", "ja"].includes(a)) return true;
			if (["n", "no", "nein"].includes(a)) return false;
			io.print("  Answer y or n.");
		}
	};
	/** Several of a list: numbers like "1,3", "all", "none", or Enter to keep the marked ones. */
	const many = async <T extends string>(q: string, choices: Choice<T>[], current: T[]): Promise<T[]> => {
		io.print(`\n${q}`);
		choices.forEach((c, i) =>
			io.print(`  ${i + 1}. [${current.includes(c.id) ? "x" : " "}] ${c.label}: ${c.description}`),
		);
		for (;;) {
			const a = (await ask("Numbers (e.g. 1,3), all, none, or Enter to keep: ")).toLowerCase();
			if (!a) return current;
			if (a === "all") return choices.map((c) => c.id);
			if (a === "none") return [];
			const nums = a.split(/[\s,]+/).map(Number);
			if (nums.every((n) => Number.isInteger(n) && n >= 1 && n <= choices.length))
				return choices.filter((_, i) => nums.includes(i + 1)).map((c) => c.id);
			io.print(`  Give numbers from 1 to ${choices.length}.`);
		}
	};
	/** One of a list, by number. */
	const one = async <T extends string>(q: string, choices: { id: T; label: string }[], current: T): Promise<T> => {
		io.print(`\n${q}`);
		choices.forEach((c, i) => io.print(`  ${i + 1}. ${c.id === current ? "(•)" : "( )"} ${c.label}`));
		for (;;) {
			const a = await ask("Number, or Enter to keep: ");
			if (!a) return current;
			const n = Number(a);
			if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].id;
			io.print(`  Give a number from 1 to ${choices.length}.`);
		}
	};
	const fields = async (type: SourceTypeId | StoreTypeId, current: Record<string, string> = {}) => {
		const config: Record<string, string> = { ...current };
		for (const f of TYPE_FIELDS[type]) {
			const secret = SECRET_FIELDS[type]?.includes(f.name);
			if (secret)
				io.print(
					`  ${f.label}: anyone who can open the site can read it. Use \${env:NAME} to keep it out of the file.`,
				);
			for (;;) {
				const v = await text(`  ${f.label}${f.hint ? ` (${f.hint})` : ""}`, config[f.name] ?? "");
				if (v || !f.required) {
					if (v) config[f.name] = v;
					else delete config[f.name];
					break;
				}
				io.print("  This one is needed.");
			}
		}
		if (type === "zotero" && config.other_library) config.library = "other";
		return config;
	};
	const idFrom = (name: string, taken: string[]) => {
		const stem =
			name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "")
				.slice(0, 24) || "item";
		let id = stem;
		for (let i = 2; taken.includes(id); i++) id = `${stem}-${i}`;
		return id;
	};

	io.print("OKMaps: a custom version. Press Enter to keep what is in [brackets]; - empties a text.\n");
	const out: OkmapsConfig = { $schema: start.$schema };

	// The site.
	out.site = {
		title: await text("Site title", base.site.title),
		lead: await text("Line under the heading", base.site.lead),
		lang: await text("Language of the pages", base.site.lang),
	};

	// Sources.
	const offer = await many("Which sources does the site offer?", SOURCES, base.sources.offer);
	let places = base.sources.places;
	if (offer.includes("places")) {
		const bundled = places.length === 1 && places[0].preset === "aquanavi" && places[0].url === "data/aquanavi.csv";
		if (!(await yes("Use the bundled AQUANAVI facility table for geo maps?", bundled))) {
			const url = await text("  Table URL (CSV or JSON)", bundled ? "" : (places[0]?.url ?? ""));
			const aquanavi = await yes("  Does it have the AQUANAVI columns?", false);
			if (aquanavi) places = [{ preset: "aquanavi", url }];
			else {
				const label = await text("  Name of the table", places[0]?.label ?? "Places");
				const title = await text("  Column with the place name", "name");
				const latitude = await text("  Column with the latitude", "latitude");
				const longitude = await text("  Column with the longitude", "longitude");
				places = [{ id: idFrom(label, []), label, url, mapping: { title, latitude, longitude } }];
			}
		} else places = [{ preset: "aquanavi", url: "data/aquanavi.csv" }];
	}
	const types = await many("Which kinds of source can people add themselves?", SOURCE_TYPES, base.sources.types);
	const presets: PresetSource[] = [...base.sources.presets];
	if (presets.length) io.print(`\nReady-made sources: ${presets.map((p) => p.name).join(", ")}.`);
	while (
		await yes(
			presets.length ? "Add another ready-made source?" : "Add a ready-made source (e.g. a project's Zotero group)?",
			false,
		)
	) {
		const type = await one("Of which kind?", SOURCE_TYPES, "zotero");
		const name = await text("  Its name in the search form", "");
		if (!name) continue;
		presets.push({
			id: idFrom(
				name,
				presets.filter((p) => p.type === type).map((p) => p.id),
			),
			type,
			name,
			config: await fields(type),
		});
	}
	out.sources = { offer, types };
	if (offer.includes("places")) out.sources.places = places;
	if (presets.length) out.sources.presets = presets;
	if (base.sources.off.length) out.sources.off = base.sources.off;
	if (Object.keys(base.sources.typePresets).length) out.sources.typePresets = base.sources.typePresets;

	// Stores.
	const storeTypes = await many("Where can maps be kept?", STORE_TYPES, base.stores.types);
	let stores: PresetStore[] = base.stores.presets.filter((s) => storeTypes.includes(s.type));
	if (storeTypes.includes("browser") && !stores.some((s) => s.type === "browser"))
		stores.unshift({ id: "browser", type: "browser", name: "This browser", config: { db: "okmaps-storage" } });
	if (!storeTypes.includes("browser")) stores = stores.filter((s) => s.type !== "browser");
	const remote = STORE_TYPES.filter((t) => t.id !== "browser" && storeTypes.includes(t.id));
	while (remote.length && (await yes("Add a store everyone starts with (e.g. a team WebDAV folder)?", false))) {
		const type = await one("Of which kind?", remote, remote[0].id);
		const name = await text("  Its name", "");
		if (!name) continue;
		stores.push({
			id: idFrom(
				name,
				stores.map((s) => s.id),
			),
			type,
			name,
			config: await fields(type),
		});
	}
	let saveTo = stores.some((s) => s.id === base.stores.saveTo) ? base.stores.saveTo : (stores[0]?.id ?? "none");
	saveTo = await one(
		"Where do new maps go?",
		[...stores.map((s) => ({ id: s.id, label: s.name })), { id: "none", label: "Nowhere: saved from the map page" }],
		saveTo,
	);
	out.stores = { types: storeTypes, presets: stores, saveTo };

	// Views and plugins.
	out.views = await many("Which map views?", VIEWS, base.views);
	out.plugins = await many("Which map plugins?", PLUGINS, base.plugins);

	// Features.
	io.print("\nWhat people can do:");
	const features: Record<string, boolean> = {};
	for (const f of FEATURES) features[f.id] = await yes(`  ${f.label}: ${f.description}`, base.features[f.id]);
	out.features = features;

	// Services.
	io.print("\nServices:");
	out.services = {
		gatewayUrl: await text("  Gateway URL (BASE and share links; - for none)", base.services.gatewayUrl),
		crossrefMailto: await text("  Contact address for Crossref", base.services.crossrefMailto),
	};
	if (out.services.gatewayUrl)
		out.services.openaireViaGateway = await yes(
			"  Call OpenAIRE through the gateway?",
			base.services.openaireViaGateway,
		);
	if (base.services.pubmedApiKey) out.services.pubmedApiKey = base.services.pubmedApiKey;

	// Theme.
	io.print("\nLook:");
	const t = base.theme;
	const skin = await one<SkinId | "none">(
		"Skin",
		[
			{ id: "none", label: "None (the OKMaps look)" },
			...SKINS.map((s) => ({ id: s.id, label: `${s.label}: ${s.description}` })),
		],
		t.skin ?? "none",
	);
	const scheme = await one<SchemeChoice>(
		"Light or dark to start with",
		[
			{ id: "system", label: "As the system is set" },
			{ id: "light", label: "Light" },
			{ id: "dark", label: "Dark" },
		],
		t.scheme,
	);
	const theme: OkmapsConfig["theme"] = { ...start.theme, scheme };
	if (skin === "none") delete theme.skin;
	else theme.skin = skin;
	for (const [k, label] of [
		["accent", "Accent colour (CSS, e.g. #1e6662)"],
		["heading", "Heading colour"],
		["font", "Font (CSS font-family)"],
		["fontStylesheet", "Font stylesheet URL"],
		["logo", "Logo (URL or path under the site)"],
		["themeColor", "Browser theme colour"],
	] as const) {
		const v = await text(`  ${label}`, t[k] ?? "");
		if (v) theme[k] = v;
		else delete theme[k];
	}
	out.theme = theme;

	const check = resolveConfig(out, { keepEnv: true });
	if (check.secrets.length) {
		io.print(`\nThe config holds secrets: ${check.secrets.join(", ")}.`);
		out.allowSecrets = await yes(
			"Build them into the site? Anyone who can open it can read them; only for private sites",
			start.allowSecrets ?? false,
		);
	} else if (start.allowSecrets) out.allowSecrets = start.allowSecrets;
	return dropDefaults(out);
}

/** Leaves out what is as on the full site, so the file says only what is special. */
export function dropDefaults(c: OkmapsConfig): OkmapsConfig {
	const d = DEFAULT_CONFIG;
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	const out: OkmapsConfig = structuredClone(c);
	if (!out.$schema) delete out.$schema;
	if (out.site) {
		for (const k of ["title", "lead", "lang"] as const) if (out.site[k] === d.site[k]) delete out.site[k];
		if (!Object.keys(out.site).length) delete out.site;
	}
	if (out.sources) {
		if (same(out.sources.offer, d.sources.offer)) delete out.sources.offer;
		if (same(out.sources.types, d.sources.types)) delete out.sources.types;
		if (same(out.sources.places, d.sources.places)) delete out.sources.places;
		if (!Object.keys(out.sources).length) delete out.sources;
	}
	if (out.stores) {
		const browserOnlyDefault = same(out.stores.presets, d.stores.presets) && out.stores.saveTo === d.stores.saveTo;
		if (browserOnlyDefault) {
			delete out.stores.presets;
			delete out.stores.saveTo;
		}
		if (same(out.stores.types, d.stores.types)) delete out.stores.types;
		if (!Object.keys(out.stores).length) delete out.stores;
	}
	if (same(out.views, d.views)) delete out.views;
	if (same(out.plugins, d.plugins)) delete out.plugins;
	if (out.features) {
		for (const k of Object.keys(out.features) as (keyof typeof d.features)[])
			if (out.features[k] === d.features[k]) delete out.features[k];
		if (!Object.keys(out.features).length) delete out.features;
	}
	if (out.services) {
		if (!out.services.gatewayUrl) delete out.services.gatewayUrl;
		if (!out.services.crossrefMailto) delete out.services.crossrefMailto;
		if (!out.services.openaireViaGateway) delete out.services.openaireViaGateway;
		if (!Object.keys(out.services).length) delete out.services;
	}
	if (out.theme) {
		if (out.theme.scheme === "system") delete out.theme.scheme;
		if (!Object.keys(out.theme).length) delete out.theme;
	}
	if (out.allowSecrets === false) delete out.allowSecrets;
	return out;
}
