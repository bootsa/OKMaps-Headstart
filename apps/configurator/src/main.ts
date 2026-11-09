/**
 * The OKMaps configurator: a form over the build config (@okmaps/config),
 * with a live preview of the theme, the file to download and the commands
 * that build it. No framework: each control writes the state and refresh()
 * redraws what depends on it.
 */
import "@okmaps/ui-svelte/styles.css";
import "./style.css";
import {
	type Choice,
	FEATURES,
	PLUGINS,
	type PresetSource,
	type PresetStore,
	SECRET_FIELDS,
	SKINS,
	SOURCE_TYPES,
	SOURCES,
	type SourceTypeId,
	STORE_TYPES,
	type StoreTypeId,
	TYPE_FIELDS,
	VIEWS,
} from "@okmaps/config";
import { check, commands, fileName, fileText, freshState, previewTokens, type State, stateFrom } from "./state.ts";

const KEY = "okmaps-configurator";

type Attrs = Record<string, string | boolean | number | undefined | ((e: Event) => void)>;

/** A small element builder: h("label", { for: "x" }, "Text", child). */
export function h(
	tag: string,
	attrs: Attrs = {},
	...children: (Node | string | null | undefined | false)[]
): HTMLElement {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v === undefined || v === false) continue;
		if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
		else if (k === "value" && "value" in el) (el as HTMLInputElement).value = String(v);
		else if (k === "checked") (el as HTMLInputElement).checked = !!v;
		else el.setAttribute(k, v === true ? "" : String(v));
	}
	for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
	return el;
}

let state: State = load();
let ids = 0;
const uid = (stem: string) => `${stem}-${++ids}`;

function load(): State {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved) return stateFrom(saved).state;
	} catch {
		// storage blocked: start fresh
	}
	return freshState();
}

function remember() {
	try {
		localStorage.setItem(KEY, fileText(state));
	} catch {
		// storage blocked: the form lasts for this visit
	}
}

// ---------------------------------------------------------------------------
// Controls

function textField(
	label: string,
	get: () => string,
	set: (v: string) => void,
	opts: { hint?: string; type?: string; placeholder?: string } = {},
) {
	const id = uid("f");
	return h(
		"div",
		{ class: "field" },
		h("label", { for: id }, label),
		h("input", {
			id,
			type: opts.type ?? "text",
			value: get(),
			placeholder: opts.placeholder,
			oninput: (e) => {
				set((e.target as HTMLInputElement).value);
				refresh();
			},
		}),
		opts.hint ? h("p", { class: "hint" }, opts.hint) : null,
	);
}

function colourField(label: string, get: () => string | undefined, set: (v: string | undefined) => void) {
	const id = uid("c");
	const text = h("input", {
		id,
		type: "text",
		value: get() ?? "",
		placeholder: "none",
		oninput: (e) => {
			const v = (e.target as HTMLInputElement).value.trim();
			set(v || undefined);
			if (/^#[0-9a-f]{6}$/i.test(v)) (picker as HTMLInputElement).value = v;
			refresh();
		},
	}) as HTMLInputElement;
	const picker = h("input", {
		type: "color",
		"aria-label": `${label}: pick`,
		value: /^#[0-9a-f]{6}$/i.test(get() ?? "") ? get() : "#167a63",
		oninput: (e) => {
			text.value = (e.target as HTMLInputElement).value;
			set(text.value);
			refresh();
		},
	});
	return h("div", { class: "field colour" }, h("label", { for: id }, label), h("div", { class: "row" }, picker, text));
}

function checks<T extends string>(
	legend: string,
	choices: Choice<T>[],
	get: () => T[],
	set: (v: T[]) => void,
	after?: () => void,
) {
	return h(
		"fieldset",
		{},
		h("legend", {}, legend),
		...choices.map((c) =>
			h(
				"label",
				{ class: "check" },
				h("input", {
					type: "checkbox",
					checked: get().includes(c.id),
					onchange: (e) => {
						const on = (e.target as HTMLInputElement).checked;
						const now = get().filter((x) => x !== c.id);
						set(on ? choices.map((x) => x.id).filter((x) => x === c.id || now.includes(x)) : now);
						after?.();
						refresh();
					},
				}),
				h("span", {}, h("strong", {}, c.label), h("span", { class: "desc" }, c.description)),
			),
		),
	);
}

function select<T extends string>(
	label: string,
	options: { id: T; label: string }[],
	get: () => T,
	set: (v: T) => void,
) {
	const id = uid("s");
	const el = h(
		"select",
		{
			id,
			onchange: (e) => {
				set((e.target as HTMLSelectElement).value as T);
				refresh();
			},
		},
		...options.map((o) => h("option", { value: o.id }, o.label)),
	) as HTMLSelectElement;
	el.value = get();
	return h("div", { class: "field" }, h("label", { for: id }, label), el);
}

/** The fields of one ready-made source or store. */
function typeFields(type: SourceTypeId | StoreTypeId, config: Record<string, string>) {
	return TYPE_FIELDS[type].map((f) =>
		textField(
			f.label,
			() => config[f.name] ?? "",
			(v) => {
				if (v) config[f.name] = v;
				else delete config[f.name];
				if (type === "zotero") config.library = config.other_library ? "other" : "";
				if (!config.library) delete config.library;
			},
			{
				hint: SECRET_FIELDS[type]?.includes(f.name)
					? "A secret: anyone who can open the site can read it. Write ${env:NAME} to set it when building."
					: f.hint,
			},
		),
	);
}

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

function presetSources(): HTMLElement {
	const box = h("div", { class: "presets" });
	const draw = () => {
		box.replaceChildren(
			...state.sources.presets.map((p: PresetSource, i) =>
				h(
					"div",
					{ class: "preset" },
					h(
						"div",
						{ class: "preset-head" },
						h("strong", {}, `${SOURCE_TYPES.find((t) => t.id === p.type)?.label}`),
						h(
							"button",
							{
								type: "button",
								class: "ghost",
								onclick: () => {
									state.sources.presets.splice(i, 1);
									draw();
									refresh();
								},
							},
							"Remove",
						),
					),
					textField(
						"Name in the search form",
						() => p.name,
						(v) => {
							p.name = v;
						},
					),
					textField(
						"Description",
						() => p.description ?? "",
						(v) => {
							p.description = v || undefined;
						},
					),
					...typeFields(p.type, p.config),
				),
			),
			h(
				"div",
				{ class: "row" },
				...SOURCE_TYPES.map((t) =>
					h(
						"button",
						{
							type: "button",
							class: "secondary",
							onclick: () => {
								const taken = state.sources.presets.filter((p) => p.type === t.id).map((p) => p.id);
								state.sources.presets.push({ id: idFrom(t.label, taken), type: t.id, name: t.label, config: {} });
								draw();
								refresh();
							},
						},
						`+ ${t.label}`,
					),
				),
			),
		);
	};
	draw();
	return box;
}

let saveToBox: HTMLElement;

function presetStores(): HTMLElement {
	const box = h("div", { class: "presets" });
	const draw = () => {
		box.replaceChildren(
			...state.stores.presets.map((p: PresetStore, i) =>
				h(
					"div",
					{ class: "preset" },
					h(
						"div",
						{ class: "preset-head" },
						h("strong", {}, `${STORE_TYPES.find((t) => t.id === p.type)?.label}`),
						h(
							"button",
							{
								type: "button",
								class: "ghost",
								onclick: () => {
									state.stores.presets.splice(i, 1);
									if (state.stores.saveTo === p.id) state.stores.saveTo = state.stores.presets[0]?.id ?? "none";
									draw();
									refresh();
								},
							},
							"Remove",
						),
					),
					textField(
						"Name",
						() => p.name,
						(v) => {
							p.name = v;
						},
					),
					...typeFields(p.type, p.config),
				),
			),
			h(
				"div",
				{ class: "row" },
				...STORE_TYPES.filter((t) => state.stores.types.includes(t.id)).map((t) =>
					h(
						"button",
						{
							type: "button",
							class: "secondary",
							onclick: () => {
								const id = idFrom(
									t.id === "browser" ? "browser" : t.label,
									state.stores.presets.map((p) => p.id),
								);
								const config: Record<string, string> =
									t.id === "browser" ? { db: id === "browser" ? "okmaps-storage" : `okmaps-store-${id}` } : {};
								state.stores.presets.push({ id, type: t.id, name: t.label, config });
								if (state.stores.saveTo === "none") state.stores.saveTo = id;
								draw();
								refresh();
							},
						},
						`+ ${t.label}`,
					),
				),
			),
		);
		drawSaveTo();
	};
	storeDraws.push(draw);
	draw();
	return box;
}
const storeDraws: (() => void)[] = [];

function drawSaveTo() {
	saveToBox?.replaceChildren(
		select(
			"New maps go to",
			[
				...state.stores.presets.map((s) => ({ id: s.id, label: s.name || s.id })),
				{ id: "none", label: "Nowhere: saved from the map page" },
			],
			() => state.stores.saveTo,
			(v) => {
				state.stores.saveTo = v;
			},
		),
	);
}

// ---------------------------------------------------------------------------
// The page

const app = document.getElementById("app")!;
let output: HTMLTextAreaElement;
let problems: HTMLElement;
let cmds: HTMLElement;
let previews: HTMLElement[] = [];
let secretBanner: HTMLElement;

function preview(scheme: "light" | "dark") {
	const el = h(
		"div",
		{ class: "okmaps preview", "data-scheme": scheme, "aria-label": `Preview, ${scheme}` },
		h("img", { class: "logo", alt: "", hidden: true }),
		h("h3", { class: "p-title" }),
		h("p", { class: "p-lead" }),
		h(
			"div",
			{ class: "p-row" },
			h("span", { class: "p-button" }, "Make map"),
			h("a", { href: "#", onclick: (e) => e.preventDefault() }, "A link"),
		),
		h("div", { class: "p-area" }, h("span", {}, "An area of the map")),
	);
	previews.push(el);
	return el;
}

function render() {
	previews = [];
	storeDraws.length = 0;
	saveToBox = h("div");
	const fileInput = h("input", {
		type: "file",
		accept: ".json,application/json",
		hidden: true,
		onchange: async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			const { state: loaded, errors } = stateFrom(await file.text());
			state = loaded;
			render();
			if (errors.length) problems.prepend(h("p", { class: "error" }, `${file.name}: ${errors.join("; ")}`));
		},
	}) as HTMLInputElement;

	secretBanner = h("div", { class: "secrets", role: "alert", hidden: true });
	problems = h("div", { class: "problems", "aria-live": "polite" });
	output = h("textarea", {
		readonly: true,
		rows: 18,
		"aria-label": "The config file",
		spellcheck: "false",
	}) as HTMLTextAreaElement;
	cmds = h("pre", { class: "commands" });
	app.replaceChildren(
		h(
			"header",
			{},
			h("h1", {}, "OKMaps configurator"),
			h(
				"p",
				{ class: "lead" },
				"Choose what a custom version of OKMaps offers and how it looks. You get its config file (okmaps.config.json) and the command that builds it; only the parts you choose go into the build.",
			),
			h(
				"div",
				{ class: "row" },
				h("button", { type: "button", class: "secondary", onclick: () => fileInput.click() }, "Open a config…"),
				h(
					"button",
					{
						type: "button",
						class: "ghost",
						onclick: () => {
							state = freshState();
							render();
						},
					},
					"Start again (the full site)",
				),
				fileInput,
			),
		),
		h(
			"div",
			{ class: "layout" },
			h(
				"form",
				{ onsubmit: (e) => e.preventDefault() },
				h(
					"section",
					{},
					h("h2", {}, "Site"),
					textField(
						"Title",
						() => state.site.title,
						(v) => {
							state.site.title = v;
						},
					),
					textField(
						"Line under the heading",
						() => state.site.lead,
						(v) => {
							state.site.lead = v;
						},
					),
					textField(
						"Language",
						() => state.site.lang,
						(v) => {
							state.site.lang = v;
						},
						{ hint: "e.g. en, de" },
					),
				),
				h(
					"section",
					{},
					h("h2", {}, "Sources"),
					checks(
						"The site offers",
						SOURCES,
						() => state.sources.offer,
						(v) => {
							state.sources.offer = v;
						},
					),
					textField(
						"Place table URL (for place tables)",
						() => state.sources.places[0]?.url ?? "",
						(v) => {
							const first = state.sources.places[0];
							if (first) first.url = v;
							else state.sources.places = [{ preset: "aquanavi", url: v }];
						},
						{
							hint: "The bundled AQUANAVI table is data/aquanavi.csv. Other columns: edit sources.places in the file.",
						},
					),
					checks(
						"People can add",
						SOURCE_TYPES,
						() => state.sources.types,
						(v) => {
							state.sources.types = v;
						},
					),
					h("h3", {}, "Ready-made sources"),
					h("p", { class: "hint" }, "Offered to everyone, e.g. the project's Zotero group or Zenodo community."),
					presetSources(),
				),
				h(
					"section",
					{},
					h("h2", {}, "Where maps are kept"),
					checks(
						"Kinds of store",
						STORE_TYPES,
						() => state.stores.types,
						(v) => {
							state.stores.types = v;
							state.stores.presets = state.stores.presets.filter((p) => v.includes(p.type));
							if (state.stores.saveTo !== "none" && !state.stores.presets.some((p) => p.id === state.stores.saveTo))
								state.stores.saveTo = state.stores.presets[0]?.id ?? "none";
						},
						() => {
							for (const d of storeDraws) d();
						},
					),
					h("h3", {}, "Stores everyone starts with"),
					presetStores(),
					saveToBox,
				),
				h(
					"section",
					{},
					h("h2", {}, "Maps"),
					checks(
						"Views",
						VIEWS,
						() => state.views,
						(v) => {
							state.views = v;
						},
					),
					checks(
						"Plugins",
						PLUGINS,
						() => state.plugins,
						(v) => {
							state.plugins = v;
						},
					),
				),
				h(
					"section",
					{},
					h("h2", {}, "What people can do"),
					checks(
						"Switched on",
						FEATURES,
						() => FEATURES.filter((f) => state.features[f.id]).map((f) => f.id),
						(v) => {
							for (const f of FEATURES) state.features[f.id] = v.includes(f.id);
						},
					),
				),
				h(
					"section",
					{},
					h("h2", {}, "Services"),
					textField(
						"Gateway URL",
						() => state.services.gatewayUrl,
						(v) => {
							state.services.gatewayUrl = v.trim();
						},
						{
							hint: "For BASE, share links and the OpenAIRE fallback. Empty: none. ${env:NAME} is read when building.",
							placeholder: "https://gateway.example.org",
						},
					),
					textField(
						"Contact address for Crossref",
						() => state.services.crossrefMailto,
						(v) => {
							state.services.crossrefMailto = v.trim();
						},
						{ type: "email" },
					),
				),
				h(
					"section",
					{},
					h("h2", {}, "Look"),
					select(
						"Skin",
						[
							{ id: "", label: "None (the OKMaps look)" },
							...SKINS.map((s) => ({ id: s.id, label: `${s.label}: ${s.description}` })),
						],
						() => state.theme.skin ?? "",
						(v) => {
							state.theme.skin = (v || undefined) as State["theme"]["skin"];
						},
					),
					select(
						"Light or dark to start with",
						[
							{ id: "system", label: "As the system is set" },
							{ id: "light", label: "Light" },
							{ id: "dark", label: "Dark" },
						],
						() => state.theme.scheme,
						(v) => {
							state.theme.scheme = v;
						},
					),
					colourField(
						"Accent colour",
						() => state.theme.accent,
						(v) => {
							state.theme.accent = v;
						},
					),
					colourField(
						"Heading colour",
						() => state.theme.heading,
						(v) => {
							state.theme.heading = v;
						},
					),
					colourField(
						"Accent in the dark scheme",
						() => state.theme.darkTokens?.["--color-accent"],
						(v) => {
							const t = { ...state.theme.darkTokens };
							if (v) t["--color-accent"] = v;
							else delete t["--color-accent"];
							state.theme.darkTokens = t;
						},
					),
					colourField(
						"Browser theme colour",
						() => state.theme.themeColor,
						(v) => {
							state.theme.themeColor = v;
						},
					),
					textField(
						"Font (CSS font-family)",
						() => state.theme.font ?? "",
						(v) => {
							state.theme.font = v || undefined;
						},
						{ placeholder: "Lato, Helvetica, sans-serif" },
					),
					textField(
						"Font stylesheet URL",
						() => state.theme.fontStylesheet ?? "",
						(v) => {
							state.theme.fontStylesheet = v || undefined;
						},
					),
					textField(
						"Logo (URL, or path under the site)",
						() => state.theme.logo ?? "",
						(v) => {
							state.theme.logo = v || undefined;
						},
					),
					textField(
						"Page icon",
						() => state.theme.favicon ?? "",
						(v) => {
							state.theme.favicon = v || undefined;
						},
					),
				),
			),
			h(
				"aside",
				{},
				h("h2", {}, "Preview"),
				h("div", { class: "previews" }, preview("light"), preview("dark")),
				secretBanner,
				h("h2", {}, "Problems"),
				problems,
				h("h2", {}, "The config file"),
				output,
				h(
					"div",
					{ class: "row" },
					h("button", { type: "button", onclick: download }, "Download"),
					h(
						"button",
						{
							type: "button",
							class: "secondary",
							onclick: async (e) => {
								const b = e.currentTarget as HTMLButtonElement;
								await navigator.clipboard?.writeText(output.value).catch(() => undefined);
								b.textContent = "Copied";
								setTimeout(() => (b.textContent = "Copy"), 1500);
							},
						},
						"Copy",
					),
				),
				h("h2", {}, "Build it"),
				h("p", { class: "hint" }, "Put the file in configs/ of a checkout of OKMaps-Headstart and run, from its root:"),
				cmds,
				h(
					"p",
					{ class: "hint" },
					"Or commit it and run the “Custom build” workflow on GitHub, which builds it and keeps the site as a download. ",
					"pnpm okmaps configure asks the same questions in a terminal.",
				),
			),
		),
	);
	drawSaveTo();
	refresh();
}

function download() {
	const blob = new Blob([output.value], { type: "application/json" });
	const a = h("a", { href: URL.createObjectURL(blob), download: fileName(state) }) as HTMLAnchorElement;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function refresh() {
	output.value = fileText(state);
	const r = check(state);
	problems.replaceChildren(
		...(r.errors.length || r.warnings.length
			? [
					...r.errors.map((e) => h("p", { class: "error" }, h("strong", {}, e.path || "config"), `: ${e.message}`)),
					...r.warnings.map((w) => h("p", { class: "warning" }, h("strong", {}, w.path || "config"), `: ${w.message}`)),
				]
			: [h("p", { class: "ok" }, "None: it builds.")]),
	);
	secretBanner.hidden = r.secrets.length === 0;
	secretBanner.textContent = r.secrets.length
		? `This config holds secrets (${r.secrets.join(", ")}). In a build anyone who can open the site can read them. Use \${env:NAME} so the file can be shared, and only set "allowSecrets" for a private site.`
		: "";
	cmds.textContent = commands(state).join("\n");
	for (const el of previews) {
		const scheme = el.dataset.scheme as "light" | "dark";
		el.removeAttribute("style");
		for (const [k, v] of Object.entries(previewTokens(state, scheme))) el.style.setProperty(k, v);
		if (state.theme.skin) el.dataset.skin = state.theme.skin;
		else delete el.dataset.skin;
		el.querySelector(".p-title")!.textContent = state.site.title;
		el.querySelector(".p-lead")!.textContent = state.site.lead;
		const logo = el.querySelector<HTMLImageElement>(".logo")!;
		logo.hidden = !/^https?:\/\//.test(state.theme.logo ?? "");
		if (!logo.hidden) logo.src = state.theme.logo!;
	}
	remember();
}

render();
