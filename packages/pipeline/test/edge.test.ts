import { beforeAll, describe, expect, it } from "vitest";
import { buildOverviewMap, loadDefaultResources, type PipelineResources, stem } from "../src/index.js";
import { punctuationSegments } from "../src/text/hygiene.js";
import { filterOutNestedNgrams } from "../src/text/ngrams.js";

let res: PipelineResources;
beforeAll(async () => {
	res = await loadDefaultResources();
});

const paper = (id: string, title: string, abstract = "", subject = "") => ({
	id,
	title,
	paper_abstract: abstract,
	subject,
});

describe("buildOverviewMap", () => {
	it("returns an empty map for no papers", () => {
		expect(buildOverviewMap({ papers: [] }, res).documents).toEqual([]);
	});

	it("handles one and two papers", () => {
		const one = buildOverviewMap(
			{ papers: [paper("a", "Coral reef bleaching", "Heat stress bleaches coral reefs.")] },
			res,
		);
		expect(one.documents).toHaveLength(1);
		expect(one.documents[0].area_uri).toBe(1);
		const two = buildOverviewMap(
			{
				papers: [
					paper("a", "Coral reef bleaching", "Heat stress bleaches coral reefs.", "coral reefs; climate"),
					paper("b", "Deep learning for protein folding", "Neural networks predict protein structure.", "proteins"),
				],
			},
			res,
		);
		expect(two.documents.map((d) => d.id)).toEqual(["a", "b"]);
		for (const d of two.documents) {
			expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
			expect(typeof d.area).toBe("string");
		}
	});

	it("does not fail on a paper without text", () => {
		const papers = Array.from({ length: 12 }, (_, i) =>
			paper(`p${i}`, i === 3 ? "" : `Topic ${i % 3} study of river ecology and water ${i % 2 ? "quality" : "flow"}`),
		);
		const m = buildOverviewMap({ papers }, res);
		expect(m.documents).toHaveLength(12);
		expect(m.documents.every((d) => Number.isFinite(d.x))).toBe(true);
	});

	it("passes unknown fields through and keeps input order", () => {
		const papers = Array.from({ length: 6 }, (_, i) => ({
			...paper(`id${i}`, `Soil carbon ${i}`),
			year: 2000 + i,
			doi: `10.1/${i}`,
		}));
		const m = buildOverviewMap({ papers }, res);
		expect(m.documents.map((d) => d.year)).toEqual([2000, 2001, 2002, 2003, 2004, 2005]);
		expect(m.documents.map((d) => d.labels)).toEqual(papers.map((p) => p.id));
	});
});

describe("text helpers", () => {
	it("stems like Snowball English", () => {
		expect(["generously", "communities", "running", "skies", "proceeding", "universal"].map(stem)).toEqual([
			"generous",
			"communiti",
			"run",
			"sky",
			"proceed",
			"univers",
		]);
	});

	it("keeps the more specific n-gram", () => {
		expect(filterOutNestedNgrams(["climate", "climate change", "ocean", "sea ice"], 3)).toEqual([
			"climate change",
			"ocean",
			"sea ice",
		]);
	});

	it("splits titles at punctuation but keeps tight compounds", () => {
		// same output as punctuation_segments() in R: a spaced paren pair bounds a segment
		expect(punctuationSegments("COVID-19 in the U.S.: a (re)view, part 2")).toEqual([
			"COVID-19 in the U.S.",
			"a",
			"(re)view",
			"part 2",
		]);
	});
});
