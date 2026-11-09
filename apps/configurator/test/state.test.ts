import { describe, expect, it } from "vitest";
import { check, commands, configOf, fileName, fileText, freshState, previewTokens, stateFrom } from "../src/state.ts";

describe("configurator state", () => {
	it("writes an empty config for the full site", () => {
		expect(configOf(freshState())).toEqual({});
		expect(JSON.parse(fileText(freshState()))).toEqual({ $schema: expect.stringContaining("schema.json") });
		expect(check(freshState()).errors).toEqual([]);
	});

	it("keeps only what differs", () => {
		const s = freshState();
		s.site.title = "Lab maps";
		s.sources.offer = ["pubmed"];
		s.views = ["overview"];
		s.features.share = false;
		s.theme.accent = "#7a2e8e";
		expect(configOf(s)).toEqual({
			site: { title: "Lab maps" },
			sources: { offer: ["pubmed"] },
			views: ["overview"],
			features: { share: false },
			theme: { accent: "#7a2e8e" },
		});
		expect(fileName(s)).toBe("lab-maps.okmaps.json");
		expect(commands(s)).toEqual([
			"pnpm okmaps check configs/lab-maps.okmaps.json",
			"pnpm okmaps build configs/lab-maps.okmaps.json --out dist-lab-maps",
		]);
	});

	it("reads a file back, ${env:...} as written", () => {
		const { state, errors } = stateFrom(
			JSON.stringify({ site: { title: "X" }, services: { gatewayUrl: "${env:GW:-}" }, views: ["geomap"] }),
		);
		expect(errors).toEqual([]);
		expect(state.services.gatewayUrl).toBe("${env:GW:-}");
		expect(configOf(state)).toMatchObject({ site: { title: "X" }, views: ["geomap"] });
		expect(stateFrom("{").errors[0]).toMatch(/Not JSON/);
	});

	it("names secrets and missing fields of ready-made sources", () => {
		const s = freshState();
		s.sources.presets.push({ id: "g", type: "zotero", name: "G", config: { api_key: "k" } });
		const r = check(s);
		expect(r.secrets).toEqual(["sources.presets[0].config.api_key"]);
		expect(r.errors.map((e) => e.path)).toContain("sources.presets[0].config.other_library");
	});

	it("previews dark colours only from the dark tokens", () => {
		const s = freshState();
		s.theme.accent = "#111111";
		s.theme.font = "Lato";
		s.theme.darkTokens = { "--color-accent": "#eeeeee" };
		expect(previewTokens(s, "light")["--color-accent"]).toBe("#111111");
		expect(previewTokens(s, "dark")).toEqual({ "--font-sans": "Lato", "--color-accent": "#eeeeee" });
	});
});
