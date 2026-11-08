import { describe, expect, it } from "vitest";
import { combineResults, type SourceRecord, titleKey } from "../src/index.js";

const rec = (id: string, fields: Partial<SourceRecord> = {}): SourceRecord => ({
	id,
	title: `A sufficiently long title number ${id}`,
	paper_abstract: null,
	subject: null,
	subject_orig: null,
	authors: "Doe, Jane",
	year: "2024",
	published_in: null,
	url: `https://example.org/${id}`,
	doi: "",
	...fields,
});
const part = (service: string, label: string, papers: SourceRecord[]) => ({
	service,
	label,
	result: {
		service,
		papers,
		query: `q ${label}`,
		content: Object.fromEntries(papers.map((p) => [p.id, `text ${p.id}`])),
	},
});

describe("combineResults", () => {
	it("keeps each work once, matched by DOI whatever its case, and fills in what the first record lacks", () => {
		const r = combineResults([
			part("pubmed", "PubMed", [rec("1", { doi: "10.1000/ABC", readers: 3 }), rec("2")]),
			part("openalex", "OpenAlex", [
				rec("W1", { doi: "10.1000/abc", paper_abstract: "An abstract.", readers: 10 }),
				rec("W9"),
			]),
		]);
		expect(r.service).toBe("combined");
		expect(r.duplicates).toBe(1);
		expect(r.papers.map((p) => p.id)).toEqual(["s1-1", "s1-2", "s2-W9"]);
		expect(r.papers[0]).toMatchObject({
			doi: "10.1000/ABC",
			paper_abstract: "An abstract.",
			readers: 10,
			source_service: "pubmed",
			sources: "PubMed; OpenAlex",
		});
		expect(r.papers[2]).toMatchObject({ source_service: "openalex", sources: "OpenAlex" });
		expect(Object.keys(r.content)).toEqual(["s1-1", "s1-2", "s2-W9"]);
		expect(r.query).toBe("q PubMed | q OpenAlex");
	});

	it("matches records without a DOI by title and year, not short titles", () => {
		const r = combineResults([
			part("zotero", "My library", [
				rec("a", { title: "Coral reefs: a review of bleaching" }),
				rec("b", { title: "Notes", year: "2020" }),
			]),
			part("zenodo", "Zenodo", [
				rec("z1", { title: "Coral Reefs – A Review of Bleaching" }),
				rec("z2", { title: "Coral reefs: a review of bleaching", year: "1999" }),
				rec("z3", { title: "Notes", year: "2020" }),
			]),
		]);
		expect(r.papers.map((p) => p.id)).toEqual(["s1-a", "s1-b", "s2-z2", "s2-z3"]);
		expect(r.duplicates).toBe(1);
		expect(titleKey("Ökologie – der Küste!")).toBe("okologiederkuste");
	});
});
