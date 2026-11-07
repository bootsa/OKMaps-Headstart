import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import {
	covisPlugin,
	gsheetsPlugin,
	infoPlugin,
	MapState,
	mapConfig,
	registerLanguages,
	registerPlugin,
	registerService,
	strings,
	triplePlugin,
	unregisterPlugin,
	Visualization,
	viperPlugin,
} from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));
const withContext = (context: Record<string, unknown>, config = {}) =>
	new MapState({ ...record, context: { ...record.context, ...context } }, 600, config);

afterEach(() => {
	for (const id of ["info", "viper", "covis", "triple", "gsheets"]) unregisterPlugin(id);
});

async function openInfo(map: MapState) {
	render(Visualization, { state: map, height: 600 });
	await fireEvent.click(screen.getByRole("button", { name: "More information" }));
	flushSync();
	return screen.getByRole("dialog");
}

describe("languages and services", () => {
	it("layers registered languages over English", () => {
		expect(strings("ger").loading).toBe("Loading...");
		registerLanguages();
		expect(strings("ger").loading).toBe("Wird geladen...");
		expect(strings("ger").copied_button_text).toBe("Kopiert");
		expect(strings("ger_linkedcat").year).toBe("Jahr");
		expect(strings("ger_linkedcat").showMore).toBe("Mehr anzeigen");
		expect(strings("eng_plos").readers).toBe("views");
	});

	it("takes settings for services it doesn't know", () => {
		expect(mapConfig("covis").sortOptions).toEqual(mapConfig("base").sortOptions);
		registerService("covis", { language: "eng_plos", contentBased: false });
		expect(mapConfig("covis")).toMatchObject({ service: "covis", language: "eng_plos", contentBased: false });
	});
});

describe("integration info pages", () => {
	it("VIPER: its own page for viper maps, and how to add resources", async () => {
		registerPlugin(infoPlugin);
		registerPlugin(viperPlugin);
		const params = {
			title: "Sea ice",
			acronym: "SEA",
			obj_id: "x&y",
			organisations: [{ name: "Evil", url: "javascript:alert(1)" }],
		};
		const map = withContext({ service: "openaire", params }, { infoType: "viper" });
		const dialog = await openInfo(map);
		expect(dialog).toHaveTextContent("VIPER, the Visual Project Explorer");
		expect(dialog.querySelector('a[href^="javascript"]')).toBeNull();
		expect(dialog).toHaveTextContent("Evil");
		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		await fireEvent.click(screen.getByRole("button", { name: "Add resources" }));
		const edit = screen.getByRole("dialog");
		expect(edit).toHaveTextContent("SEA - Sea ice");
		expect(screen.getByRole("link", { name: "continue to openaire" })).toHaveAttribute(
			"href",
			"https://www.openaire.eu/search/project?projectId=x%26y",
		);
	});

	it("OpenAIRE maps without the viper type keep the OpenAIRE page", async () => {
		registerPlugin(infoPlugin);
		registerPlugin(viperPlugin);
		const dialog = await openInfo(withContext({ service: "openaire", params: { title: "Sea ice" } }));
		expect(dialog).not.toHaveTextContent("VIPER");
		expect(dialog).toHaveTextContent("Project Details");
	});

	it("CoVis, GoTriple and Google Sheets pages", async () => {
		registerPlugin(infoPlugin);
		registerPlugin(covisPlugin("https://covis.example/"));
		registerPlugin(triplePlugin);
		registerPlugin(gsheetsPlugin);

		let dialog = await openInfo(withContext({ service: "covis" }));
		expect(dialog).toHaveTextContent("curated by ReFigure");
		expect(screen.getByRole("link", { name: "get in touch" })).toHaveAttribute(
			"href",
			"https://covis.example/contact-us",
		);
		document.body.innerHTML = "";

		dialog = await openInfo(withContext({ service: "triple_km" }));
		expect(dialog).toHaveTextContent("GoTriple");
		document.body.innerHTML = "";

		const params = {
			main_curator_name: "Ann",
			main_curator_email: "ann@example.org",
			project_name: "Reefs",
			project_website: "javascript:alert(1)",
			sheet_id: "abc",
		};
		dialog = await openInfo(withContext({ service: "gsheets", params }));
		expect(screen.getByRole("link", { name: "Ann" })).toHaveAttribute("href", "mailto:ann@example.org");
		expect(screen.queryByRole("link", { name: "Reefs" })).toBeNull();
		expect(dialog).toHaveTextContent("as part of Reefs");
		expect(screen.getByRole("link", { name: "a spreadsheet" })).toHaveAttribute(
			"href",
			"https://docs.google.com/spreadsheets/d/abc/edit#gid=0",
		);
	});
});
