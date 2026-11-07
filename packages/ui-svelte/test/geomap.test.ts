import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { infoPlugin, MapState, pinLabel, registerPlugin, unregisterPlugin, Visualization } from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "aquanavi-geomap.json"), "utf8"));
const geoMap = () => new MapState(record, 600, { visType: "geomap" });

afterEach(() => unregisterPlugin("info"));

async function pins(container: HTMLElement) {
	await waitFor(() => expect(container.querySelectorAll(".okm-pin").length).toBeGreaterThan(0), { timeout: 5000 });
	return [...container.querySelectorAll<HTMLElement>(".okm-pin")];
}

describe("geo map", () => {
	it("names a pin after its resource and place", () => {
		expect(pinLabel("Skogaryd", { country: "Sweden", continent: "Europe" })).toBe("Skogaryd; Sweden, Europe");
		expect(pinLabel("Somewhere", null)).toBe("Somewhere");
	});

	it("puts a pin on the map for each resource with a place", async () => {
		const map = geoMap();
		const { container } = render(Visualization, { state: map, height: 600 });
		expect(container.querySelector(".okm-knowledge-map")).toBeNull();
		const placed = map.map.papers.filter((p) => p.place?.north !== null && p.place?.east !== null);
		expect(await pins(container)).toHaveLength(placed.length);
		const first = (await pins(container))[0];
		expect(first.getAttribute("role")).toBe("button");
		expect(first.getAttribute("aria-label")).toContain(";");
	});

	it("selects a resource from its pin, and the list shows its place but no area", async () => {
		const map = geoMap();
		const { container } = render(Visualization, { state: map, height: 600 });
		const pin = (await pins(container))[0];
		await fireEvent.keyDown(pin, { key: "Enter" });
		flushSync();
		expect(map.selectedPaper).toBe(pin.dataset.id);
		expect(map.zoomedArea).toBeNull();
		const entry = container.querySelector(".okm-entry.selected") as HTMLElement;
		expect(entry.textContent).toContain("Location:");
		expect(entry.querySelector(".authors")).toBeNull();
		expect(entry.querySelector(".area")).toBeNull();
		await waitFor(() => expect(container.querySelector(`.okm-pin.active[data-id="${pin.dataset.id}"]`)).not.toBeNull());
	});

	it("lights up the pin of the resource hovered in the list", async () => {
		const map = geoMap();
		const { container } = render(Visualization, { state: map, height: 600 });
		const pin = (await pins(container))[0];
		const entry = container.querySelector(`#entry-${pin.dataset.id} .title button`) as HTMLElement;
		await fireEvent.pointerEnter(entry);
		expect(map.hoveredPaper).toBe(pin.dataset.id);
		await waitFor(() => expect(container.querySelector(`.okm-pin.active[data-id="${pin.dataset.id}"]`)).not.toBeNull());
		await fireEvent.pointerLeave(entry);
		expect(map.hoveredPaper).toBeNull();
	});

	it("has the geo map info page", async () => {
		registerPlugin(infoPlugin);
		render(Visualization, { state: geoMap(), height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: "More information" }));
		flushSync();
		expect(screen.getByRole("dialog").textContent).toContain(
			"This geo map presents you with an overview of aquatic mesocosm facilities.",
		);
	});
});
