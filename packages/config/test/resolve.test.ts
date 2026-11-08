import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../src/index.ts";

describe("resolveConfig", () => {
	it("is the full site without settings", () => {
		const r = resolveConfig({}, { env: {} });
		expect(r.errors).toEqual([]);
		expect(r.config).toEqual(DEFAULT_CONFIG);
		expect(r.config.views).toEqual(["overview", "timeline", "geomap"]);
		expect(r.config.stores.presets.map((s) => s.id)).toEqual(["browser"]);
	});

	it("keeps what is given and fills the rest", () => {
		const r = resolveConfig(
			{ site: { title: "Biomed" }, sources: { offer: ["pubmed"] }, views: ["overview"], features: { share: false } },
			{ env: {} },
		);
		expect(r.errors).toEqual([]);
		expect(r.config.site.title).toBe("Biomed");
		expect(r.config.site.lead).toBe(DEFAULT_CONFIG.site.lead);
		expect(r.config.sources.offer).toEqual(["pubmed"]);
		expect(r.config.features.share).toBe(false);
		expect(r.config.features.explorer).toBe(true);
	});

	it("names unknown ids and wrong types", () => {
		const r = resolveConfig({ views: ["globe"], features: { share: "yes" }, theme: { scheme: "dim" } }, { env: {} });
		expect(r.errors.map((e) => e.path)).toEqual(
			expect.arrayContaining(["views[0]", "features.share", "theme.scheme", "views"]),
		);
	});

	it("warns about unknown settings and doubtful choices", () => {
		const r = resolveConfig(
			{ colour: "red", sources: { offer: ["base", "places"] }, views: ["overview"] },
			{ env: {} },
		);
		const paths = r.warnings.map((w) => w.path);
		expect(paths).toContain("colour");
		// places without the geo map; BASE and share links without a gateway
		expect(r.warnings.map((w) => w.message).join("\n")).toMatch(/geomap/);
		expect(r.warnings.map((w) => w.message).join("\n")).toMatch(/BASE needs/);
		expect(paths).toContain("features.share");
	});

	it("refuses secrets unless they are allowed, and then warns", () => {
		const input = {
			sources: {
				presets: [{ id: "lab", type: "zotero", name: "Lab", config: { other_library: "groups/1", api_key: "k" } }],
			},
			services: { pubmedApiKey: "p" },
		};
		const refused = resolveConfig(input, { env: {} });
		expect(refused.secrets).toEqual(["sources.presets[0].config.api_key", "services.pubmedApiKey"]);
		expect(refused.errors.map((e) => e.path)).toEqual(refused.secrets);
		const allowed = resolveConfig({ ...input, allowSecrets: true }, { env: {} });
		expect(allowed.errors).toEqual([]);
		expect(allowed.warnings.map((w) => w.path)).toEqual(expect.arrayContaining(allowed.secrets));
	});

	it("reads ${env:NAME} values, with fallbacks", () => {
		const r = resolveConfig(
			{ services: { gatewayUrl: "${env:GW}", crossrefMailto: "${env:MAIL:-maps@example.org}" } },
			{ env: { GW: "https://gw.example.org" } },
		);
		expect(r.errors).toEqual([]);
		expect(r.config.services.gatewayUrl).toBe("https://gw.example.org");
		expect(r.config.services.crossrefMailto).toBe("maps@example.org");
		const missing = resolveConfig({ services: { gatewayUrl: "${env:GW}" } }, { env: {} });
		expect(missing.errors[0]).toMatchObject({ path: "services.gatewayUrl" });
		expect(resolveConfig({ site: { title: "${env:X}" } }, { keepEnv: true }).config.site.title).toBe("${env:X}");
	});

	it("checks stores: types, ids and the default", () => {
		const r = resolveConfig(
			{
				stores: {
					types: ["webdav"],
					presets: [
						{ id: "team", type: "webdav", name: "Team", config: { url: "https://dav.example.org/" } },
						{ id: "team", type: "solid", name: "Pod", config: {} },
					],
					saveTo: "elsewhere",
				},
			},
			{ env: {} },
		);
		const paths = r.errors.map((e) => e.path);
		expect(paths).toEqual(expect.arrayContaining(["stores.presets[1].type", "stores.presets", "stores.saveTo"]));
	});

	it("drops the default browser store when browser stores are not offered", () => {
		const r = resolveConfig({ stores: { types: ["webdav"] } }, { env: {} });
		expect(r.config.stores.presets).toEqual([]);
		expect(r.config.stores.saveTo).toBe("none");
	});

	it("keeps CSS values from closing the theme's rule", () => {
		const r = resolveConfig(
			{ theme: { accent: "red;}</style><script>", tokens: { "--color-link": "blue}", color: "red" } } },
			{ env: {} },
		);
		expect(r.errors.map((e) => e.path)).toEqual(
			expect.arrayContaining(["theme.accent", "theme.tokens.--color-link", "theme.tokens.color"]),
		);
	});

	it("needs something to search", () => {
		const r = resolveConfig({ sources: { offer: [], types: [] } }, { env: {} });
		expect(r.errors[0].path).toBe("sources");
	});
});
