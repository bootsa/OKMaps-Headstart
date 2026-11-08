import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/index.ts";
import { type Prompt, wizard } from "../src/wizard.ts";

/** Answers questions by the first matching pattern (each answer used once, in order); Enter otherwise. */
function script(answers: [RegExp, string][]): Prompt & { asked: string[]; printed: string[] } {
	const left = [...answers];
	const asked: string[] = [];
	const printed: string[] = [];
	let lastList = "";
	return {
		asked,
		printed,
		async ask(q) {
			asked.push(q);
			const key = `${lastList} ${q}`;
			const i = left.findIndex(([re]) => re.test(key));
			if (i < 0) return "";
			const [[, a]] = left.splice(i, 1);
			return a;
		},
		print(t) {
			printed.push(t);
			if (!t.startsWith("  ")) lastList = t.trim();
		},
	};
}

describe("wizard", () => {
	it("writes nothing special when every answer is the default", async () => {
		expect(await wizard(script([]))).toEqual({});
	});

	it("makes a PubMed-only version with a ready-made source and a team store", async () => {
		const io = script([
			[/Site title/, "Lab maps"],
			[/Which sources does the site offer\? Numbers/, "1"],
			[/kinds of source can people add.*Numbers/, "none"],
			[/Add a ready-made source/, "y"],
			[/Of which kind\? Number/, "3"],
			[/Its name in the search form/, "Lab group"],
			[/Library/, "groups/42"],
			[/Add another ready-made source/, "n"],
			[/Where can maps be kept\? Numbers/, "1,2"],
			[/Add a store everyone starts with/, "y"],
			[/Its name/, "Team"],
			[/Folder URL/, "https://dav.example.org/maps/"],
			[/Password/, "${env:DAV_PASSWORD}"],
			[/Add a store everyone starts with/, "n"],
			[/Where do new maps go\? Number/, "2"],
			[/Which map views\? Numbers/, "1"],
			[/Settings page/, "n"],
			[/Accent colour/, "#7a2e8e"],
			[/Light or dark to start with Number/, "2"],
			[/Build them into the site/, "y"],
		]);
		const config = await wizard(io);
		expect(config).toMatchObject({
			site: { title: "Lab maps" },
			sources: {
				offer: ["pubmed"],
				types: [],
				presets: [
					{
						id: "lab-group",
						type: "zotero",
						name: "Lab group",
						config: { other_library: "groups/42", library: "other" },
					},
				],
			},
			stores: {
				types: ["browser", "webdav"],
				presets: [
					{ id: "browser", type: "browser" },
					{
						id: "team",
						type: "webdav",
						name: "Team",
						config: { url: "https://dav.example.org/maps/", password: "${env:DAV_PASSWORD}" },
					},
				],
				saveTo: "team",
			},
			views: ["overview"],
			features: { settingsPage: false },
			theme: { accent: "#7a2e8e", scheme: "light" },
			allowSecrets: true,
		});
		// The secret warning came before the password question.
		expect(io.printed.some((t) => t.includes("anyone who can open the site can read it"))).toBe(true);
		const r = resolveConfig(config, { env: { DAV_PASSWORD: "pw" } });
		expect(r.errors).toEqual([]);
		expect(r.secrets).toEqual(["stores.presets[1].config.password"]);
	});

	it("starts from an existing config and keeps its env placeholders", async () => {
		const start = JSON.parse(fs.readFileSync(new URL("../examples/project-library.json", import.meta.url), "utf8"));
		const config = await wizard(script([]), start);
		expect(config.services?.gatewayUrl).toBe("${env:OKMAPS_GATEWAY:-}");
		expect(config.sources?.presets).toEqual(start.sources.presets);
		expect(config.stores).toEqual(start.stores);
		expect(config.features).toEqual(start.features);
		expect(config.theme).toEqual(start.theme);
	});

	it("asks again after a wrong answer", async () => {
		const io = script([
			[/Which map views\? Numbers/, "9"],
			[/Which map views\? Numbers/, "3"],
			[/Which sources does the site offer\? Numbers/, "4"],
		]);
		const config = await wizard(io);
		expect(config.views).toEqual(["geomap"]);
		expect(io.printed).toContain("  Give numbers from 1 to 3.");
	});
});
