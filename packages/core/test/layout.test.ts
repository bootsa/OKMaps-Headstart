import fs from "node:fs";
import path from "node:path";
import type { Area, Paper } from "@okmaps/core";
import { layoutAreas, layoutPapers } from "@okmaps/core";
import { describe, expect, it } from "vitest";

// Areas and papers of the BASE fixture at 600 px, before and after the old
// d3 v3 force layout (packages/ui utils/force.ts, area alpha 0.02, papers 0.1).
const golden = JSON.parse(
	fs.readFileSync(path.join(__dirname, "../../ui-svelte/test/fixtures", "force.legacy.json"), "utf8"),
);

describe("knowledge map layout", () => {
	it("moves areas and papers exactly like the old force layout", () => {
		const areas = golden.in.areas.map((a: { area_uri: string }) => ({ ...a, uri: a.area_uri })) as Area[];
		const papers = golden.in.papers.map((p: { area_uri: string }) => ({ ...p, areaUri: p.area_uri })) as Paper[];
		layoutAreas(areas, 600, 0.02);
		layoutPapers(papers, areas, 0.1);
		areas.forEach((a, i) => {
			expect(a.x).toBeCloseTo(golden.out.areas[i].x, 3);
			expect(a.y).toBeCloseTo(golden.out.areas[i].y, 3);
		});
		papers.forEach((p, i) => {
			expect(p.x).toBeCloseTo(golden.out.papers[i].x, 3);
			expect(p.y).toBeCloseTo(golden.out.papers[i].y, 3);
		});
	});

	it("separates two overlapping areas and pulls an overflowing one in", () => {
		const areas = [
			{ uri: "a", x: 300, y: 300, r: 60 },
			{ uri: "b", x: 310, y: 300, r: 60 },
			{ uri: "c", x: 590, y: 590, r: 50 },
		] as Area[];
		layoutAreas(areas, 600, 0.05);
		expect(Math.hypot(areas[0].x - areas[1].x, areas[0].y - areas[1].y)).toBeGreaterThan(10);
		expect(areas[2].x).toBeLessThan(590);
	});
});
