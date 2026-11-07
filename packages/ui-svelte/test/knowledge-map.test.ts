import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import {
	getTheme,
	highlightParts,
	KnowledgeMap,
	labelsTheme,
	MapState,
	mapGeometry,
	octagonShape,
	queryTerms,
	Visualization,
} from "../src/index";
import { dogEarPath, iconRect, labelWidth, paperPath, popupPlacement } from "../src/views/knowledge-map/geometry";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));

describe("highlighting", () => {
	it("parses query terms like the old query reducer", () => {
		expect(queryTerms('"climate change" and (sea OR ice) -arctic title:x [MeSH]')).toEqual([
			"climate change",
			"sea",
			"OR",
			"ice",
			"arctic",
			"titlex",
		]);
		expect(queryTerms(undefined)).toEqual([]);
	});

	it("marks search words anywhere and query terms as whole words", () => {
		expect(highlightParts("Sea ice and seasons", ["sea"])).toEqual([
			{ text: "Sea", mark: "search" },
			{ text: " ice and ", mark: null },
			{ text: "sea", mark: "search" },
			{ text: "sons", mark: null },
		]);
		expect(highlightParts("Sea ice and seasons", [], ["sea"])).toEqual([
			{ text: "Sea", mark: "query" },
			{ text: " ice and seasons", mark: null },
		]);
		expect(highlightParts("a (b) c", ["(b)"])).toHaveLength(3);
	});
});

describe("knowledge map geometry", () => {
	it("centres the zoomed area and scales it to 90% of the chart", () => {
		const state = new MapState(record, 600);
		const area = state.map.areas[0];
		const g = mapGeometry(state.map.areas, state.map.papers, 600, area);
		expect(g.areas[area.uri].x).toBeCloseTo(300);
		expect(g.areas[area.uri].y).toBeCloseTo(300);
		expect(g.areas[area.uri].r).toBeCloseTo(270);
		const paper = area.papers[0];
		expect(g.papers[paper.safeId].w / paper.width).toBeCloseTo(270 / area.r);
	});

	it.each([600, 420])("keeps zoomed titles apart and inside the circle at %d px", (size) => {
		const state = new MapState(record, size);
		for (const area of state.map.areas) {
			const g = mapGeometry(state.map.areas, state.map.papers, size, area, labelsTheme);
			const circle = g.areas[area.uri];
			const boxes = area.papers.map((p) => {
				const icon = iconRect(g.papers[p.safeId], true);
				const r = icon.x + icon.w + 6 + labelWidth(size);
				return { l: icon.x, r, t: icon.y + icon.h / 2 - 17, b: icon.y + icon.h / 2 + 17 };
			});
			let overlaps = 0;
			for (let i = 0; i < boxes.length; i++)
				for (let j = i + 1; j < boxes.length; j++) {
					const [a, b] = [boxes[i], boxes[j]];
					if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1) overlaps++;
				}
			expect(overlaps, area.title).toBe(0);
			for (const b of boxes) {
				const dx = Math.max(Math.abs(b.l - circle.x), Math.abs(b.r - circle.x));
				const dy = Math.max(Math.abs(b.t - circle.y), Math.abs(b.b - circle.y));
				expect(Math.hypot(dx, dy), area.title).toBeLessThanOrEqual(circle.r + 0.5);
			}
			// Icons and titles together sit centred, not off to one side.
			const middle = (Math.min(...boxes.map((b) => b.l)) + Math.max(...boxes.map((b) => b.r))) / 2;
			expect(Math.abs(middle - circle.x), area.title).toBeLessThan(10);
		}
	});

	it("draws the paper paths of the old map", () => {
		const r = { x: 0, y: 0, w: 100, h: 200 };
		expect(paperPath(r)).toBe("M 0 0 h 85 l 15 30 v 170 h -100 v -200");
		expect(dogEarPath(r)).toBe("M 85 0 v 30 h 15");
	});

	it("keeps zoomed papers icon-sized and popups inside the chart", () => {
		const r = { x: 100, y: 100, w: 120, h: 160 };
		expect(iconRect(r, false)).toBe(r);
		const icon = iconRect(r, true);
		expect(icon.h).toBe(44);
		expect(icon.w).toBeCloseTo(33);
		expect(icon.x + icon.w / 2).toBe(160);
		expect(iconRect({ x: 0, y: 0, w: 9, h: 12 }, true).h).toBe(18);
		expect(popupPlacement(icon, 600, 260, 100)).toEqual({ x: icon.x + icon.w + 8, y: 130 });
		const nearEdge = { x: 500, y: 560, w: 30, h: 40 };
		expect(popupPlacement(nearEdge, 600, 260, 100)).toEqual({ x: 232, y: 500 });
	});
});

describe("KnowledgeMap", () => {
	const draw = (rec = record) => {
		const state = new MapState(rec, 600);
		const result = render(KnowledgeMap, { state, duration: 0 });
		flushSync();
		return { state, ...result };
	};

	it("draws one bubble per area and every paper", () => {
		const { state, container } = draw();
		expect(container.querySelectorAll(".okm-bubble")).toHaveLength(state.map.areas.length);
		expect(container.querySelectorAll(".okm-paper")).toHaveLength(60);
	});

	it("zooms in on click, selects a paper, and zooms out on the background", async () => {
		const { state, container } = draw();
		const area = state.map.areas[1];
		await fireEvent.click(screen.getByRole("button", { name: area.title }));
		expect(state.zoomedArea).toBe(area.uri);
		expect(container.querySelectorAll(".okm-paper")).toHaveLength(area.papers.length);

		const paper = area.papers[0];
		const shape = [...container.querySelectorAll(".okm-paper")].find((g) => g.textContent?.includes(paper.title));
		expect(shape).toHaveAttribute("role", "button");
		await fireEvent.click(shape as Element);
		expect(state.selectedPaper).toBe(paper.safeId);
		expect(container.querySelector(".okm-paper.selected")).not.toBeNull();

		await fireEvent.click(container.querySelector("rect.background") as Element);
		expect(state.zoomedArea).toBeNull();
	});

	it("shows a paper's details in a popup on hover, as text", async () => {
		const crafted = '<img src=x onerror="window.hacked=1">';
		const rec = structuredClone(record);
		rec.documents[0].published_in = crafted;
		const { state, container } = draw(rec);
		const paper = state.map.papers.find((p) => p.id === rec.documents[0].id);
		state.zoomIn(paper?.areaUri ?? "");
		flushSync();
		const shape = [...container.querySelectorAll(".okm-paper")].find((g) =>
			g.textContent?.includes(paper?.title ?? "-"),
		) as Element;
		expect(shape).not.toBeNull();
		await fireEvent.pointerEnter(shape);
		const popup = container.querySelector(".okm-popup");
		expect(popup?.textContent).toContain(crafted);
		expect(container.querySelector("img")).toBeNull();
		await fireEvent.pointerLeave(shape);
		expect(container.querySelector(".okm-popup")).toBeNull();
	});

	it("hides papers that do not match the search", async () => {
		const { state, container } = draw();
		state.search = state.map.papers[0].title;
		flushSync();
		expect(container.querySelectorAll(".okm-paper").length).toBeLessThan(60);
		state.zoomIn(state.map.papers[0].areaUri);
		flushSync();
		expect(container.querySelector(".okm-paper mark.search")).not.toBeNull();
	});

	it("renders crafted area titles and paper titles as text", () => {
		const crafted = '<img src=x onerror="window.hacked=1">';
		const rec = structuredClone(record);
		const uri = rec.documents[0].area_uri;
		for (const d of rec.documents) if (d.area_uri === uri) d.area = crafted;
		rec.documents[0].title = crafted;
		const { container } = draw(rec);
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain(crafted);
	});
});

describe("map themes", () => {
	const draw = (theme: string) => {
		const state = new MapState(record, 600);
		state.theme = theme;
		const result = render(KnowledgeMap, { state, duration: 0 });
		flushSync();
		return { state, ...result };
	};

	it("falls back to the labels theme for an unknown id", () => {
		expect(getTheme("nope").id).toBe("labels");
		expect(getTheme("original").name).toBe("Original");
	});

	it("original: writes the details on the paper and enlarges it on hover, without a popup", async () => {
		const { state, container } = draw("original");
		const paper = state.map.papers[0];
		expect(container.querySelector(".okm-paper .authors")).not.toBeNull();
		state.zoomIn(paper.areaUri);
		flushSync();
		const shape = [...container.querySelectorAll(".okm-paper")].find((g) => g.textContent?.includes(paper.title));
		const width = () => Number(shape?.querySelector("foreignObject")?.getAttribute("width"));
		const before = width();
		await fireEvent.pointerEnter(shape as Element);
		expect(width()).toBeGreaterThan(before);
		expect(container.querySelector(".okm-popup")).toBeNull();
		// Papers keep their layout positions: nothing moves them apart.
		const g = mapGeometry(state.map.areas, state.map.papers, 600, state.area, getTheme("original"));
		const plain = mapGeometry(state.map.areas, state.map.papers, 600, state.area);
		expect(g.papers[paper.safeId]).toEqual(plain.papers[paper.safeId]);
	});

	it("octagons: draws areas as octagons and keeps papers inside them", () => {
		const { container } = draw("octagons");
		const d = container.querySelector(".okm-bubble .outline")?.getAttribute("d") ?? "";
		expect(d.match(/[ML]/g)).toHaveLength(8);
		const state = new MapState(record, 600);
		const theme = getTheme("octagons");
		for (const area of state.map.areas) {
			const g = mapGeometry(state.map.areas, state.map.papers, 600, area, {
				inset: theme.shape.inset,
				placePapers: theme.placePapers,
			});
			const c = g.areas[area.uri];
			for (const p of area.papers) {
				const r = g.papers[p.safeId];
				expect(Math.hypot(r.x + r.w / 2 - c.x, r.y + r.h / 2 - c.y)).toBeLessThan(c.r * octagonShape.inset);
			}
		}
	});

	it("switches theme from the picker, remembers it, and takes ?theme= from the URL", async () => {
		window.history.replaceState(null, "", "?theme=original");
		const state = new MapState(record, 600);
		const { container } = render(Visualization, { state, height: 600 });
		flushSync();
		expect(state.theme).toBe("original");
		const select = screen.getByLabelText("Map style") as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: "labels" } });
		expect(state.theme).toBe("labels");
		expect(window.localStorage.getItem("okmaps-map-theme")).toBe("labels");
		expect(container.querySelector(".okm-paper .authors")).toBeNull();
		window.history.replaceState(null, "", "?");
		window.localStorage.clear();
	});
});

describe("dark mode", () => {
	it("switches the page to dark and back, remembering the choice", async () => {
		window.localStorage.clear();
		const state = new MapState(record, 600);
		render(Visualization, { state, height: 600 });
		flushSync();
		expect(document.documentElement.dataset.scheme).toBe("light");
		await fireEvent.click(screen.getByRole("button", { name: "Display settings" }));
		const button = screen.getByRole("button", { name: "Dark mode" });
		await fireEvent.click(button);
		expect(button).toHaveAttribute("aria-pressed", "true");
		expect(document.documentElement.dataset.scheme).toBe("dark");
		expect(window.localStorage.getItem("okmaps-scheme")).toBe("dark");
		await fireEvent.click(button);
		expect(document.documentElement.dataset.scheme).toBe("light");
		window.localStorage.clear();
	});
});
