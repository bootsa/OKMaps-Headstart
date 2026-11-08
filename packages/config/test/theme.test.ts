import { describe, expect, it } from "vitest";
import { pageHead, resolveConfig, themeCss } from "../src/index.ts";

describe("theme", () => {
	it("sets light colours, fonts for both schemes and dark tokens", () => {
		const css = themeCss({ accent: "#123456", font: "Lato, sans-serif", darkTokens: { "--color-accent": "#abcdef" } });
		expect(css).toContain(":root:root {\n\t--font-sans: Lato, sans-serif;\n}");
		expect(css).toContain(':root:root:not([data-scheme="dark"]) {\n\t--color-accent: #123456;');
		expect(css).toContain(':root:root[data-scheme="dark"] {\n\t--color-accent: #abcdef;\n}');
	});

	it("lets tokens win over the shorthands", () => {
		expect(themeCss({ accent: "red", tokens: { "--color-accent": "blue" } })).toContain("--color-accent: blue;");
	});

	it("puts the skin and language on <html>", () => {
		const { config } = resolveConfig(
			{ site: { lang: "de" }, theme: { skin: "covis", scheme: "dark", fontStylesheet: "https://f.example/x.css" } },
			{ env: {} },
		);
		const { head, htmlAttrs } = pageHead(config);
		expect(htmlAttrs).toEqual({ lang: "de", "data-skin": "covis" });
		expect(head).toContain('<link rel="stylesheet" href="https://f.example/x.css" />');
	});

	it("adds nothing for the plain OKMaps look", () => {
		const { config } = resolveConfig({}, { env: {} });
		expect(pageHead(config).head).toBe("");
	});
});
