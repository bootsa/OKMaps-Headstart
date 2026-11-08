import fs from "node:fs";
import path from "node:path";
import { demoSource, memoryStoreType } from "@okmaps/core/testing";
import { flushSync } from "svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AppSettings,
	createMap,
	defineElements,
	fillMapHref,
	type MapRecord,
	type MapSnapshot,
	type OkmapsMapElement,
	registerSource,
	registerStoreType,
	type SearchEventDetail,
	unregisterSource,
	unregisterStoreType,
} from "../src/index";

const record: MapRecord = JSON.parse(
	fs.readFileSync(path.join(__dirname, "../../ui-svelte/test/fixtures/base-map.json"), "utf8"),
);

/** Lets queued redraws, fetches and Svelte effects run. */
async function settle() {
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setTimeout(r, 0));
		flushSync();
	}
}

const memory = () => {
	const data = new Map<string, string>();
	return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

beforeAll(() => defineElements());
afterEach(() => document.body.replaceChildren());

describe("createMap (plain JavaScript)", () => {
	it("draws a map, tells about changes and takes it down again", async () => {
		const target = document.createElement("div");
		document.body.append(target);
		const map = createMap(target, record, { height: 600 });
		expect(target.classList.contains("okmaps")).toBe(true);
		expect(target.querySelector("[data-testid='list-view'], .okm-list, ul")).not.toBeNull();
		expect(map.snapshot()).toMatchObject({ visType: "overview", zoomedArea: null, selectedPaper: null });
		expect(map.snapshot().listed).toHaveLength(record.documents.length);

		const changes: MapSnapshot[] = [];
		map.on("change", (s) => changes.push(s));
		const area = map.state.map.areas[0];
		map.zoomIn(area.uri);
		await settle();
		expect(changes.at(-1)).toMatchObject({ zoomedArea: area.uri });
		expect(changes.at(-1)?.listed).toHaveLength(area.papers.length);

		map.setSearch("zzzz-no-such-word");
		await settle();
		expect(changes.at(-1)).toMatchObject({ search: "zzzz-no-such-word", listed: [] });

		map.destroy();
		await settle();
		expect(target.children).toHaveLength(0);
	});

	it("draws the view it is asked for", () => {
		const target = document.createElement("div");
		const map = createMap(target, record, { visType: "timeline" });
		expect(map.snapshot().visType).toBe("timeline");
		map.destroy();
	});
});

describe("<okmaps-map>", () => {
	it("draws the record property and fires okmaps-ready and okmaps-change", async () => {
		const el = document.createElement("okmaps-map") as OkmapsMapElement;
		const ready = vi.fn();
		const changed = vi.fn();
		el.addEventListener("okmaps-ready", ready);
		el.addEventListener("okmaps-change", (e) => changed((e as CustomEvent<MapSnapshot>).detail));
		el.record = record;
		document.body.append(el);
		await settle();
		expect(ready).toHaveBeenCalledTimes(1);
		expect(el.handle).not.toBeNull();
		expect(el.children.length).toBeGreaterThan(0);

		const area = el.handle!.state.map.areas[1];
		el.zoomIn(area.uri);
		await settle();
		expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ zoomedArea: area.uri }));
		el.zoomOut();
		await settle();
		expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ zoomedArea: null }));
	});

	it("loads the JSON at src", async () => {
		const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(record)));
		const el = document.createElement("okmaps-map") as OkmapsMapElement;
		el.setAttribute("src", "maps/one.json");
		el.setAttribute("vis-type", "timeline");
		document.body.append(el);
		await settle();
		expect(fetch).toHaveBeenCalledWith("maps/one.json");
		expect(el.handle?.snapshot().visType).toBe("timeline");
		fetch.mockRestore();
	});

	it("reports a src it cannot load", async () => {
		const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
		const el = document.createElement("okmaps-map");
		const failed = vi.fn();
		el.addEventListener("okmaps-error", failed);
		el.setAttribute("src", "missing.json");
		document.body.append(el);
		await settle();
		expect(failed).toHaveBeenCalledTimes(1);
		fetch.mockRestore();
	});

	it("takes a record set before the tag was defined (as frameworks may)", async () => {
		const el = document.createElement("okmaps-map-late") as OkmapsMapElement;
		(el as unknown as { record: MapRecord }).record = record;
		document.body.append(el);
		const { OkmapsMapElement } = await import("../src/elements");
		customElements.define("okmaps-map-late", class extends OkmapsMapElement {});
		await settle();
		expect(el.handle).not.toBeNull();
	});

	it("takes the map down when removed", async () => {
		const el = document.createElement("okmaps-map") as OkmapsMapElement;
		el.record = record;
		document.body.append(el);
		await settle();
		const handle = el.handle!;
		const destroy = vi.spyOn(handle, "destroy");
		el.remove();
		expect(destroy).toHaveBeenCalled();
		expect(el.handle).toBeNull();
	});
});

describe("<okmaps-search>, <okmaps-settings>, <okmaps-explorer>", () => {
	beforeEach(() => {
		registerSource(demoSource);
		registerStoreType(memoryStoreType);
	});
	afterEach(() => {
		unregisterSource("demo");
		unregisterStoreType("memory");
	});

	const settings = () =>
		new AppSettings({
			storage: memory(),
			seed: () => ({ stores: [{ id: "b", type: "memory", name: "This browser", config: {} }] }),
		});

	it("hands the search over in an okmaps-search event and shows a failure", async () => {
		const el = document.createElement("okmaps-search");
		el.settings = settings();
		const searched = vi.fn((e: Event) => {
			const detail = (e as CustomEvent<SearchEventDetail>).detail;
			detail.waitUntil(Promise.reject(new Error("Nothing found.")));
		});
		el.addEventListener("okmaps-search", searched);
		document.body.append(el);
		await settle();
		const input = el.querySelector<HTMLInputElement>("input[name='q'], input[type='search'], input[type='text']")!;
		input.value = "sea ice";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Make map"))!;
		button.click();
		await settle();
		expect(searched).toHaveBeenCalledTimes(1);
		const detail = (searched.mock.calls[0][0] as CustomEvent<SearchEventDetail>).detail;
		expect(detail).toMatchObject({ view: "overview", title: "sea ice", saveTo: { store: "b", path: [] } });
		expect(el.querySelector("[role='status']")?.textContent).toContain("Nothing found.");
	});

	it("draws the settings page and the explorer from the same settings", async () => {
		const shared = settings();
		const page = document.createElement("okmaps-settings");
		page.settings = shared;
		const explorer = document.createElement("okmaps-explorer");
		explorer.settings = shared;
		explorer.setAttribute("open", "");
		document.body.append(page, explorer);
		await settle();
		expect(page.textContent).toContain("Demo library");
		expect(explorer.textContent).toContain("This browser");

		shared.putStore({ id: "c", type: "memory", name: "Second store", config: {} });
		await settle();
		expect(page.textContent).toContain("Second store");
		expect(explorer.textContent).toContain("Second store");
	});

	it("fills map links from a template", () => {
		expect(fillMapHref("m.html?s={store}&p={path}&id={id}", "b", ["a b", "c"], "x/1")).toBe(
			"m.html?s=b&p=a%20b%2Fc&id=x%2F1",
		);
	});
});
