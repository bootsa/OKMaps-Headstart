import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { citedBySum } from "../src/data/papers";
import {
	infoPlugin,
	MapState,
	orcidPlugin,
	registerLanguages,
	registerPlugin,
	unregisterPlugin,
	Visualization,
} from "../src/index";
import { dateRange, researcherSections } from "../src/plugins/integrations/orcid/researcher";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));

const author = {
	author_name: "Ada Lovelace",
	orcid_id: "0000-0002-1825-0097",
	biography: "Mathematician.",
	employment: { role: "Senior research software engineer", organization: "IGB" },
	employments: [
		{ id: "1", role: "Engineer", organization: "IGB", start_date: "2019" },
		{ id: "2", role: "Student", organization: "FU Berlin", start_date: "2014", end_date: "2018" },
	],
	researcher_urls: [
		{ id: "a", url: "https://example.org/ada", url_name: "Homepage" },
		{ id: "b", url: "javascript:alert(1)", url_name: "Bad" },
	],
	normalized_h_index: 1.234,
	academic_age: 7,
	h_index: 9,
	total_citations: 120,
};

function orcidMap(params: Record<string, unknown> = {}) {
	const documents = record.documents.map((d: Record<string, unknown>, i: number) =>
		i === 0
			? { ...d, citation_count: 5, cited_by_tweeters_count: 2, cited_by_rdts_count: "1", cited_by_msm_count: 3 }
			: d,
	);
	return new MapState(
		{
			...record,
			documents,
			author,
			context: {
				...record.context,
				service: "orcid",
				query: "0000-0002-1825-0097",
				params: { image_link: "https://example.org/ada.png", ...params },
			},
		},
		600,
	);
}

afterEach(() => {
	for (const id of ["info", "orcid"]) unregisterPlugin(id);
});

describe("ORCID helpers", () => {
	it("sums the cited_by counts, n/a when there are none", () => {
		expect(citedBySum({ cited_by_tweeters_count: 2, cited_by_rdts_count: "1" }, ["tweeters", "rdts", "qna"])).toBe(3);
		expect(citedBySum({}, ["tweeters"])).toBe("n/a");
	});

	it("writes date ranges like the old modal", () => {
		expect(dateRange({ start_date: "2019" })).toBe("2019 - present");
		expect(dateRange({ start_date: "2019", end_date: "2019" })).toBe("2019");
		expect(dateRange({})).toBe("");
		expect(dateRange({ start_date: "2020" }, false)).toBe("2020");
	});

	it("keeps only web links", () => {
		const links = researcherSections(author).find((s) => s.id === "links");
		expect(links?.entries).toEqual([{ text: "", href: "https://example.org/ada", linkText: "Homepage" }]);
	});
});

describe("ORCID plugin", () => {
	it("titles the map with the researcher, pictures them and shows their job", () => {
		registerLanguages();
		registerPlugin(orcidPlugin());
		const map = orcidMap();
		const { container } = render(Visualization, { state: map, height: 600 });
		const heading = screen.getByRole("heading", { level: 1 });
		expect(heading.textContent).toContain("Knowledge map for the works of");
		expect(heading.textContent).toContain("Ada Lovelace (0000-0002-1825-0097)");
		const link = container.querySelector<HTMLAnchorElement>(".author-image");
		expect(link?.href).toBe("https://orcid.org/0000-0002-1825-0097");
		expect(link?.querySelector("img")?.getAttribute("src")).toBe("https://example.org/ada.png");
		expect(container.querySelector('[data-item="author_role"]')?.textContent).toContain("Senior research...");
		expect(container.querySelector('[data-item="author_organization"]')?.textContent).toContain("IGB");
	});

	it("shows citations, social media mentions and references in the list", () => {
		registerPlugin(orcidPlugin());
		const map = orcidMap();
		const { container } = render(Visualization, { state: map, height: 600 });
		const entry = container.querySelector(`#entry-${map.map.papers[0].safeId}`) as HTMLElement;
		expect(entry.querySelector('[data-metric="citations"]')?.textContent).toMatch(/^5 citations/);
		expect(entry.querySelector('[data-metric="social"]')?.textContent).toMatch(/^3 /);
		expect(entry.querySelector('[data-metric="references"]')?.textContent).toMatch(/^3 /);
	});

	it("opens the researcher details and metrics", async () => {
		registerPlugin(orcidPlugin());
		render(Visualization, { state: orcidMap({ enable_h_index: "true" }), height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: "Researcher details" }));
		flushSync();
		let dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("Mathematician.");
		expect(dialog.textContent).toContain("2019 - present / Engineer / IGB");
		expect(dialog.textContent).not.toContain("FU Berlin");
		await fireEvent.click(within(dialog).getAllByRole("button", { name: "Show more" })[0]);
		expect(dialog.textContent).toContain("2014 - 2018 / Student / FU Berlin");
		await fireEvent.click(within(dialog).getByRole("button", { name: /close/i }));
		flushSync();

		await fireEvent.click(screen.getByRole("button", { name: "Metrics" }));
		flushSync();
		dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("Normalised h-index: 1.2");
		expect(dialog.textContent).toContain("h-index: 9");
		expect(dialog.textContent).toContain("Number of total unique social media mentions: not available");
		expect(dialog.textContent).not.toContain("Teaching");
	});

	it("has its own info page", async () => {
		registerLanguages();
		registerPlugin(infoPlugin);
		registerPlugin(orcidPlugin());
		render(Visualization, { state: orcidMap(), height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: "About the map" }));
		flushSync();
		expect(screen.getByRole("dialog").textContent).toContain("most recent works of Ada Lovelace (0000-0002-1825-0097)");
	});

	it("leaves other maps alone", () => {
		registerPlugin(orcidPlugin());
		const map = new MapState(record, 600);
		const { container } = render(Visualization, { state: map, height: 600 });
		expect(container.querySelector(".author-image")).toBeNull();
		expect(container.querySelector("[data-metric]")).toBeNull();
	});
});
