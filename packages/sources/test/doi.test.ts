import { describe, expect, it } from "vitest";
import { normalizeDoi, toOpenalexRecords, toZenodoRecord } from "../src/index.js";

describe("normalizeDoi", () => {
	it("trims and lowercases, and keeps empty values empty", () => {
		expect(normalizeDoi(" 10.1000/XYZ.Abc ")).toBe("10.1000/xyz.abc");
		expect(normalizeDoi(undefined)).toBe("");
		expect(normalizeDoi(null)).toBe("");
	});

	it("is applied by the sources that do not lowercase DOIs themselves", () => {
		const { papers } = toOpenalexRecords([
			{ id: "https://openalex.org/W1", title: "One", doi: "https://doi.org/10.1234/ABC" },
		]);
		expect(papers[0].doi).toBe("10.1234/abc");
		expect(toZenodoRecord({ id: 1, doi: "10.5281/ZENODO.1", metadata: { title: "Z" } }).doi).toBe("10.5281/zenodo.1");
	});
});
