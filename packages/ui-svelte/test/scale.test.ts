import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { MapState, scaleMetric, Visualization } from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));
const documents = record.documents.map((d: Record<string, unknown>, i: number) => ({
	...d,
	citation_count: i === 0 ? 500 : 1,
	cited_by_tweeters_count: i === 1 ? 300 : undefined,
}));

const scalable = () =>
	new MapState({ ...record, documents }, 600, {
		scaleOptions: ["content_based", "citation_count", "cited_by_accounts_count"],
		scaleExplanations: { citation_count: "Sized by citations." },
	});

describe("scale map by", () => {
	it("reads the metric of each choice", () => {
		expect(scaleMetric({ citation_count: "12" }, "citations")).toBe(12);
		expect(scaleMetric({ cited_by_tweeters_count: 2, cited_by_rdts_count: 1 }, "cited_by_accounts_count")).toBe(3);
		expect(scaleMetric({ cited_by_wikipedia_count: 4 }, "references")).toBe(4);
		expect(scaleMetric({}, "citation_count")).toBe("n/a");
		expect(scaleMetric({ "readers.mendeley": 7, readers: 7 }, "readers.mendeley")).toBe(7);
	});

	it("starts with the first choice and resizes the papers on another", () => {
		const map = scalable();
		expect(map.scaleBy).toBe("content_based");
		const first = map.map.papers.find((p) => p.raw === documents[0]);
		const other = map.map.papers.find((p) => p.raw === documents[2]);
		expect(first?.diameter).toBe(other?.diameter);

		map.scale("citation_count");
		expect(map.config.contentBased).toBe(false);
		const big = map.map.papers.find((p) => p.raw === documents[0]);
		const small = map.map.papers.find((p) => p.raw === documents[2]);
		expect(big?.readers).toBe(500);
		expect(big?.diameter).toBeGreaterThan(small?.diameter ?? 0);

		map.scale("cited_by_accounts_count");
		const tweeted = map.map.papers.find((p) => p.raw === documents[1]);
		expect(tweeted?.readers).toBe(300);
	});

	it("offers the choices in the settings panel", async () => {
		const map = scalable();
		render(Visualization, { state: map, height: 600 });
		const select = screen.getByLabelText(/^Scale map by/) as HTMLSelectElement;
		expect([...select.options].map((o) => o.textContent)).toEqual(["Documents", "Citations", "Social media mentions"]);
		await fireEvent.change(select, { target: { value: "citation_count" } });
		expect(map.scaleBy).toBe("citation_count");
		expect(screen.getByText("Sized by citations.")).toBeTruthy();
		expect(document.querySelector(".okm-entry")?.textContent).toMatch(/\d+ citations/);
	});

	it("is not offered without choices", () => {
		render(Visualization, { state: new MapState(record, 600), height: 600 });
		expect(screen.queryByLabelText(/^Scale map by/)).toBeNull();
	});
});
