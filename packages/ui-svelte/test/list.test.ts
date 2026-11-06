import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { authorsLine, List, MapState, shortTitle, Visualization } from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));

const entries = (c: HTMLElement) => c.querySelectorAll("article.okm-entry");
const count = (c: HTMLElement) => Number(c.querySelector(".count")?.textContent);

describe("list text", () => {
	it("cuts author lists like the old list", () => {
		expect(authorsLine(["A", "B", "C"])).toBe("A, B, C");
		const many = Array.from({ length: 20 }, (_, i) => `Author ${i}`);
		expect(authorsLine(many)).toBe(`${many.slice(0, 14).join(", ")}, ... Author 19`);
		const long = Array.from({ length: 10 }, (_, i) => `Somebody Withalongname${i}`);
		expect(authorsLine(long).endsWith("...")).toBe(true);
		expect(authorsLine(long).length).toBeLessThanOrEqual(103);
		expect(authorsLine(long, true)).toBe(long.join(", "));
	});

	it("cuts titles to fit the date", () => {
		expect(shortTitle("short", 7)).toBe("short");
		const t = shortTitle("x".repeat(300), 7);
		expect(t).toHaveLength(157);
		expect(t.endsWith("...")).toBe(true);
	});
});

describe("List", () => {
	const draw = (rec = record) => {
		const state = new MapState(rec, 600);
		const result = render(List, { state, debounce: 0 });
		return { state, ...result };
	};

	it("lists every paper in the overview with its count", () => {
		const { container } = draw();
		expect(entries(container)).toHaveLength(60);
		expect(count(container)).toBe(60);
		expect(screen.getByRole("button", { name: /Overview/ })).toHaveAttribute("aria-expanded", "true");
	});

	it("hides and shows the entries", async () => {
		const { container } = draw();
		await fireEvent.click(screen.getByRole("button", { name: /Overview/ }));
		expect(entries(container)).toHaveLength(0);
		expect(screen.queryByRole("searchbox")).toBeNull();
	});

	it("searches after a pause and clears", async () => {
		const { state, container } = draw();
		const box = screen.getByRole("searchbox");
		await fireEvent.input(box, { target: { value: "stuff" } });
		await new Promise((r) => setTimeout(r, 10));
		flushSync();
		expect(state.search).toBe("stuff");
		expect(entries(container).length).toBe(state.listed.length);
		expect(container.querySelector("mark.search")).not.toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
		expect(entries(container)).toHaveLength(60);
	});

	it("filters and sorts", async () => {
		const { state, container } = draw();
		const [filter, sort] = screen.getAllByRole("combobox") as HTMLSelectElement[];
		await fireEvent.change(filter, { target: { value: "open_access" } });
		expect(state.filter).toBe("open_access");
		expect(entries(container)).toHaveLength(state.map.papers.filter((p) => p.oa).length);
		await fireEvent.change(filter, { target: { value: "all" } });
		await fireEvent.change(sort, { target: { value: "title" } });
		expect(state.sort).toBe("title");
		const ids = [...entries(container)].map((e) => e.id);
		expect(ids).toEqual(state.listed.map((p) => `entry-${p.safeId}`));
		expect(
			state.listed[0].title.localeCompare(state.listed[1].title, undefined, { sensitivity: "base" }),
		).toBeLessThanOrEqual(0);
	});

	it("selects a paper from its title and goes back to the area", async () => {
		const { state, container } = draw();
		const paper = state.map.papers[5];
		const title = container.querySelector(`[id="entry-${paper.safeId}"] .title button`) as HTMLElement;
		await fireEvent.click(title);
		expect(state.selectedPaper).toBe(paper.safeId);
		expect(state.zoomedArea).toBe(paper.areaUri);
		expect(entries(container)).toHaveLength(1);
		await fireEvent.click(screen.getByRole("button", { name: "Show all resources in area" }));
		expect(entries(container)).toHaveLength(state.area?.papers.length ?? -1);
		await fireEvent.click(screen.getByRole("button", { name: "← Back to overview" }));
		expect(state.zoomedArea).toBeNull();
	});

	it("names the zoomed area in the header, next to the way back", async () => {
		const { state, container } = draw();
		expect(screen.queryByRole("button", { name: "← Back to overview" })).toBeNull();
		state.zoomIn(state.map.areas[1].uri);
		flushSync();
		expect(container.querySelector(".header .heading")?.textContent).toBe(state.map.areas[1].title);
		expect(count(container)).toBe(state.map.areas[1].papers.length);
		await fireEvent.click(screen.getByRole("button", { name: "← Back to overview" }));
		expect(container.querySelector(".header .heading")?.textContent).toBe("Overview");
	});

	it("switches between fitting the screen and full height", async () => {
		const { state, container } = draw();
		expect(container.querySelector(".okm-list")).toHaveClass("fit");
		await fireEvent.click(screen.getByRole("button", { name: /Full height/ }));
		expect(state.listFit).toBe(false);
		expect(container.querySelector(".okm-list")).not.toHaveClass("fit");
		expect(screen.getByRole("button", { name: /Fit to screen/ })).toHaveAttribute("aria-pressed", "true");
	});

	it("zooms into an area from its name", async () => {
		const { state, container } = draw();
		const paper = state.map.papers[0];
		const area = container.querySelector(`[id="entry-${paper.safeId}"] .area button`) as HTMLElement;
		await fireEvent.click(area);
		expect(state.zoomedArea).toBe(paper.areaUri);
	});

	it("says when nothing matches", async () => {
		const { state } = draw();
		state.search = "zzzzqqqq";
		flushSync();
		expect(screen.getByText(/No matches found/)).toBeInTheDocument();
	});

	it("renders crafted titles, abstracts and areas as text", () => {
		const crafted = '<img src=x onerror="window.hacked=1">';
		const rec = structuredClone(record);
		Object.assign(rec.documents[0], { title: crafted, paper_abstract: crafted, area: crafted, published_in: crafted });
		const { container } = draw(rec);
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain(crafted);
	});
});

describe("Visualization", () => {
	it("draws the map and the list together, in step", async () => {
		const state = new MapState(record, 600);
		const { container } = render(Visualization, { state });
		flushSync();
		expect(container.querySelector("svg.okm-knowledge-map")).not.toBeNull();
		expect(entries(container)).toHaveLength(60);
		state.zoomIn(state.map.areas[0].uri);
		flushSync();
		expect(entries(container)).toHaveLength(state.map.areas[0].papers.length);
	});
});
