import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/node.ts";
import { flagsCode, type ModuleCatalog, moduleCode, publicConfig, transformPage } from "../src/vite.ts";

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>Settings - Open Knowledge Maps</title>
    <meta name="theme-color" content="#2856b6" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
  </head>
  <body>
    <h1 data-okmaps="title">Open Knowledge Maps</h1>
    <p class="lead" data-okmaps="lead">Old lead</p>
    <p class="hint" data-okmaps-feature="settingsPage"><a href="settings.html">Settings</a></p>
  </body>
</html>`;

const write = (name: string, config: unknown) => {
	const file = `${fs.mkdtempSync("/tmp/okmaps-config-")}/${name}`;
	fs.writeFileSync(file, JSON.stringify(config));
	return file;
};

describe("moduleCode", () => {
	const catalog: ModuleCatalog = {
		sources: {
			pubmed: { from: "/s.ts", export: "pubmedSource" },
			places: { from: "/s.ts", export: "placeModules", call: true },
		},
		sourceTypes: { zotero: { from: "/z.ts", export: "zoteroSourceType" } },
		storeTypes: {},
		views: {},
		plugins: {},
	};

	it("imports only the chosen modules", () => {
		const code = moduleCode([
			{ name: "sources", ids: ["places"], group: catalog.sources },
			{ name: "sourceTypes", ids: ["zotero"], group: catalog.sourceTypes, byId: true },
		]);
		expect(code).not.toContain("pubmedSource");
		expect(code).toContain('import { placeModules as m0 } from "/s.ts";');
		expect(code).toContain("export const sources = [m0()].flat();");
		expect(code).toContain('export const sourceTypes = { "zotero": m1 };');
	});

	it("fails for an id the catalog lacks", () => {
		expect(() => moduleCode([{ name: "sources", ids: ["base"], group: catalog.sources }])).toThrow(/no module "base"/);
	});
});

describe("flagsCode", () => {
	it("has one constant per id", () => {
		const { config } = loadConfig(write("a.json", { sources: { offer: ["pubmed"], types: [] }, views: ["overview"] }), {
			env: {},
		});
		const code = flagsCode(config);
		expect(code).toContain("export const pubmed = true;");
		expect(code).toContain("export const base = false;");
		expect(code).toContain("export const zotero = false;");
		expect(code).toContain("export const timeline = false;");
	});

	it("builds the types of ready-made sources", () => {
		const { config } = loadConfig(
			write("b.json", {
				sources: {
					types: [],
					presets: [{ id: "g", type: "zotero", name: "G", config: { other_library: "groups/1" } }],
				},
			}),
			{ env: {} },
		);
		expect(flagsCode(config)).toContain("export const zotero = true;");
	});
});

describe("transformPage", () => {
	it("names, themes and trims the page", () => {
		const build = loadConfig(
			write("c.json", {
				site: { title: "Lab <Maps>", lead: "Our maps", lang: "de" },
				features: { settingsPage: false },
				theme: { accent: "#7a2e8e", themeColor: "#7a2e8e", favicon: "logo.png", logo: "logo.svg", skin: "viper" },
			}),
			{ env: {} },
		);
		const html = transformPage(PAGE, build);
		expect(html).toContain("<title>Settings - Lab &lt;Maps&gt;</title>");
		expect(html).toContain('<h1 data-okmaps="title">Lab &lt;Maps&gt;</h1>');
		expect(html).toContain('<img class="okm-site-logo" src="logo.svg" alt="" />');
		expect(html).toContain('data-okmaps="lead">Our maps</p>');
		expect(html).not.toContain("settings.html");
		expect(html).toContain('<meta name="theme-color" content="#7a2e8e" />');
		expect(html).toContain('<link rel="icon" href="logo.png" />');
		expect(html).toContain('<html lang="de" data-skin="viper">');
		expect(html).toMatch(/<style id="okmaps-theme">[\s\S]*--color-accent: #7a2e8e;[\s\S]*<\/style>\n {2}<\/head>/);
	});

	it("leaves the full site's page as it is", () => {
		const page = PAGE.replace(
			"Old lead",
			"Get an overview of a research topic. The map is made in your browser and kept where you choose.",
		);
		expect(transformPage(page, loadConfig(undefined, { env: {} }))).toBe(page);
	});
});

describe("loadConfig", () => {
	it("takes the VITE_* variables where the config says nothing", () => {
		const env = {
			VITE_GATEWAY_URL: "https://gw.example.org",
			VITE_PLACE_SOURCES: '[{"preset":"aquanavi","url":"x.csv"}]',
		};
		const full = loadConfig(undefined, { env });
		expect(full.config.services.gatewayUrl).toBe("https://gw.example.org");
		expect(full.config.sources.places).toEqual([{ preset: "aquanavi", url: "x.csv" }]);
		const own = loadConfig(write("d.json", { services: { gatewayUrl: "" } }), { env });
		expect(own.config.services.gatewayUrl).toBe("");
	});

	it("reads $OKMAPS_CONFIG and throws for its problems", () => {
		const file = write("e.json", { views: [] });
		expect(() => loadConfig(undefined, { env: { OKMAPS_CONFIG: file } })).toThrow(/views: needs at least one view/);
	});

	it("reads the theme's CSS file next to the config", () => {
		const file = write("f.json", { theme: { css: "extra.css" } });
		fs.writeFileSync(file.replace("f.json", "extra.css"), "h1 { color: red }");
		expect(loadConfig(file, { env: {} }).extraCss).toBe("h1 { color: red }");
	});

	it("keeps secrets out of the app's config unless allowed", () => {
		const { config } = loadConfig(write("g.json", { services: { pubmedApiKey: "k" }, allowSecrets: true }), {
			env: {},
		});
		expect(publicConfig(config).services.pubmedApiKey).toBe("k");
		expect(publicConfig({ ...config, allowSecrets: false }).services.pubmedApiKey).toBeUndefined();
	});
});
