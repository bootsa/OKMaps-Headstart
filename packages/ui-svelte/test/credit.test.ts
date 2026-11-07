import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import {
	createdAt,
	creditPlugin,
	MapState,
	registerPlugin,
	unregisterPlugin,
	Visualization,
	withoutEmbed,
} from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));

afterEach(() => unregisterPlugin("credit"));

describe("credit", () => {
	it("formats the time the map was made", () => {
		expect(createdAt("2026-11-07 09:05:00")).toBe("on 7 Nov 2026 at 09:05");
		expect(createdAt("not a date")).toBe("");
		expect(createdAt(undefined)).toBe("");
	});

	it("takes embed=true off the map's address", () => {
		expect(withoutEmbed("https://x.org/map.html?id=1&embed=true#a")).toBe("https://x.org/map.html?id=1");
	});

	it("credits the maker and offers to create a map", async () => {
		registerPlugin(
			creditPlugin({
				faqs: "https://example.org/faq",
				create: "https://example.org/",
				timestamp: "2026-11-07 09:05:00",
				link: async () => "https://example.org/map?id=1&embed=true",
			}),
		);
		render(Visualization, { state: new MapState(record, 600), height: 600 });
		await waitFor(() =>
			expect(screen.getByRole("link", { name: "This visualization" }).getAttribute("href")).toBe(
				"https://example.org/map?id=1",
			),
		);
		expect(screen.getByRole("link", { name: "Open Knowledge Maps" }).getAttribute("href")).toBe(
			"https://openknowledgemaps.org",
		);
		expect(document.querySelector(".okm-credit")?.textContent).toContain("on 7 Nov 2026 at 09:05.");
		expect(screen.getByRole("link", { name: "read our FAQs" }).getAttribute("href")).toBe("https://example.org/faq");
		expect(screen.getByRole("link", { name: "Create a knowledge map" }).getAttribute("href")).toBe(
			"https://example.org/",
		);
	});

	it("leaves out the create link without an address", () => {
		registerPlugin(creditPlugin());
		render(Visualization, { state: new MapState(record, 600), height: 600 });
		expect(screen.queryByRole("link", { name: "Create a knowledge map" })).toBeNull();
	});
});
