import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import {
	citationDate,
	corePlugins,
	MapState,
	mapCitation,
	registerCorePlugins,
	registerPlugin,
	unregisterPlugin,
	Visualization,
} from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));
const withContext = (context: Record<string, unknown>) =>
	new MapState({ ...record, context: { ...record.context, ...context } }, 600);

afterEach(() => {
	for (const p of corePlugins) unregisterPlugin(p.id);
	unregisterPlugin("test");
});

describe("map citation", () => {
	it("follows the old template", () => {
		const map = withContext({ query: "sea ice", timestamp: "2026-11-06 14:05:09" });
		expect(citationDate("2026-11-06 14:05:09")).toBe("6 Nov 2026");
		expect(mapCitation(map, "https://example.org/map.html?id=1&embed=true", 2026)).toBe(
			"Open Knowledge Maps (2026). Knowledge Map for research on sea ice. Retrieved from https://example.org/map.html?id=1 [6 Nov 2026].",
		);
		expect(mapCitation(withContext({ query: "x", custom_title: "My title" }), "https://e.org/", 2026)).toBe(
			"Open Knowledge Maps (2026). Knowledge Map for research on My title. Retrieved from https://e.org/.",
		);
	});
});

describe("plugins in the interface", () => {
	it("shows no toolbar or info link without plugins", () => {
		render(Visualization, { state: withContext({ params: { from: "2000-01-01", to: "2001-01-01" } }), height: 600 });
		expect(screen.queryByRole("button", { name: "Cite" })).toBeNull();
		expect(screen.queryByRole("button", { name: "More information" })).toBeNull();
	});

	it("opens the info page and the citation from the header", async () => {
		registerCorePlugins();
		const crafted = '<img src=x onerror="window.hacked=1">';
		const map = withContext({ query: crafted, params: { sorting: "most-relevant", repo_name: "My repo" } });
		const { container } = render(Visualization, { state: map, height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: "More information" }));
		flushSync();
		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("What's this?");
		expect(dialog.textContent).toContain(`research on ${crafted}`);
		expect(dialog.textContent).toContain("My repo (via BASE)");
		expect(container.querySelector("img[src=x]")).toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(map.modal).toBeNull();

		await fireEvent.click(screen.getByRole("button", { name: "Cite" }));
		flushSync();
		expect(screen.getByRole("dialog").textContent).toContain("Please cite this knowledge map as follows");
		expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
	});

	it("shows the OpenAIRE project's details, keeping only web links", async () => {
		registerCorePlugins();
		const map = new MapState(
			{
				...record,
				context: {
					service: "openaire",
					query: "1",
					params: {
						title: "Project X",
						acronym: "PX",
						obj_id: "abc",
						organisations: [
							{ name: "Good", url: "https://good.example" },
							{ name: "Bad", url: "javascript:alert(1)" },
						],
					},
				},
			},
			600,
		);
		render(Visualization, { state: map, height: 600 });
		map.openModal("info");
		flushSync();
		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("Project X");
		expect(screen.getByRole("link", { name: "Good" })).toHaveAttribute("href", "https://good.example");
		expect(screen.queryByRole("link", { name: "Bad" })).toBeNull();
	});

	it("lets a plugin add its own action and modal", async () => {
		const Body = (await import("./fixtures/PluginBody.svelte")).default;
		registerPlugin({
			id: "test",
			actions: [{ id: "hello", label: "Hello", run: (m) => m.openModal("hello", { name: "Steph" }) }],
			modals: { hello: { title: () => "Greeting", component: Body } },
		});
		render(Visualization, { state: withContext({}), height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: "Hello" }));
		flushSync();
		expect(screen.getByRole("dialog").textContent).toContain("Hello Steph");
	});
});
