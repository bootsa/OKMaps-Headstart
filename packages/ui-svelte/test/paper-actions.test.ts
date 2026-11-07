import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import {
	bibtexType,
	citationStyles,
	corePlugins,
	isNonText,
	ListEntry,
	MapState,
	type Paper,
	paperBibtex,
	paperCitation,
	pdfPlugin,
	registerCorePlugins,
	registerPlugin,
	unregisterPlugin,
	Visualization,
} from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));

afterEach(() => {
	for (const p of corePlugins) unregisterPlugin(p.id);
	unregisterPlugin("pdf");
});

/** A map with one document changed. */
function mapWith(doc: Record<string, unknown>) {
	const rec = structuredClone(record);
	Object.assign(rec.documents[0], doc);
	const map = new MapState(rec, 600);
	const paper = map.map.papers.find((p) => p.id === rec.documents[0].id) as Paper;
	return { map, paper };
}

describe("BibTeX export", () => {
	it("writes the old export service's entry", () => {
		const { paper } = mapWith({
			id: "1234",
			title: "Test Title",
			authors: "Doe, John",
			doi: "https://doi.org/10.1234/test",
			published_in: "Journal of Testing",
			resulttype: ["Journal/newspaper article"],
			year: "2020-05-01",
		});
		expect(paperBibtex(paper)).toBe(
			[
				"@article{1234,",
				" author = {Doe, John},",
				" day = {1},",
				" doi = {10.1234/test},",
				" journal = {Journal of Testing},",
				" month = {5},",
				" title = {Test Title},",
				" url = {https://doi.org/10.1234/test},",
				" year = {2020}",
				"}",
				"",
			].join("\n"),
		);
	});

	it("maps document types like the old service", () => {
		expect(bibtexType("Thesis: master")).toBe("mastersthesis");
		expect(bibtexType("Review")).toBe("techreport");
		expect(bibtexType("Something new")).toBe("article");
		const { paper } = mapWith({ resulttype: ["Dataset"], published_in: "", year: "2019" });
		expect(paperBibtex(paper)).toMatch(/^@misc\{/);
		expect(paperBibtex(paper)).toContain(" year = {2019}\n");
		const book = mapWith({ resulttype: ["Book"], published_in: "Springer" }).paper;
		expect(paperBibtex(book)).toContain(" publisher = {Springer}");
	});
});

describe("paper citations", () => {
	it("formats a paper in each style, with the link for ACM", async () => {
		const { paper } = mapWith({ title: "Sea ice", authors: "Doe, John; Roe, Jane", year: "2020", doi: "" });
		const apa = await paperCitation(paper, citationStyles[0]);
		expect(apa).toContain("Doe, J.");
		expect(apa).toContain("Sea ice");
		expect(apa).toContain("2020");
		const acm = await paperCitation(paper, citationStyles[3]);
		expect(acm.endsWith(` ${paper.listLink?.address}`)).toBe(true);
	});
});

describe("paper buttons", () => {
	it("knows which documents are not text", () => {
		const types = (resultType: string[]) => isNonText({ resultType } as Paper);
		expect(types(["Journal/newspaper article"])).toBe(false);
		expect(types(["Dataset"])).toBe(true);
		expect(types(["Other/Unknown material"])).toBe(true);
		expect(types(["Other/Unknown material", "Book"])).toBe(false);
	});

	it("shows no buttons without plugins", () => {
		const { map, paper } = mapWith({});
		render(ListEntry, { state: map, paper });
		expect(screen.queryByRole("button", { name: "Cite as" })).toBeNull();
	});

	it("shows PDF, Cite as and Export for open access text, File for open data", () => {
		registerCorePlugins();
		const text = mapWith({ oa_state: "1", link: "https://example.org/a.pdf" });
		render(ListEntry, { state: text.map, paper: text.paper });
		for (const name of ["PDF", "Cite as", "Export"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
		document.body.innerHTML = "";

		const data = mapWith({ oa_state: "1", resulttype: ["Dataset"] });
		render(ListEntry, { state: data.map, paper: data.paper });
		expect(screen.queryByRole("button", { name: "PDF" })).toBeNull();
		expect(screen.getByRole("link", { name: "File" })).toHaveAttribute("target", "_blank");
		document.body.innerHTML = "";

		const landing = mapWith({ oa_state: "1", link: "https://example.org/record/1" });
		render(ListEntry, { state: landing.map, paper: landing.paper });
		expect(screen.queryByRole("button", { name: "PDF" })).toBeNull();
		document.body.innerHTML = "";

		const closed = mapWith({ oa_state: "2", link: "https://example.org/a.pdf" });
		render(ListEntry, { state: closed.map, paper: closed.paper });
		expect(screen.queryByRole("button", { name: "PDF" })).toBeNull();
	});

	it("leaves out Cite as for excluded types and maps that don't cite papers", () => {
		registerCorePlugins();
		const rec = structuredClone(record);
		const map = new MapState(rec, 600, { noCitationDoctypes: ["journal/newspaper article"] });
		render(ListEntry, { state: map, paper: map.map.papers[0] });
		expect(screen.queryByRole("button", { name: "Cite as" })).toBeNull();
		expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
	});

	it("opens the citation, the export and the PDF from the list", async () => {
		registerCorePlugins();
		registerPlugin(pdfPlugin({ resolve: () => "https://example.org/paper.pdf" }));
		const crafted = '<img src=x onerror="window.hacked=1">';
		const { map, paper } = mapWith({ oa_state: "1", title: crafted });
		const { container } = render(Visualization, { state: map, height: 600 });
		const entry = container.querySelector(`#entry-${paper.safeId}`) as HTMLElement;
		const within = (name: string) =>
			[...entry.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLElement;

		await fireEvent.click(within("Cite as"));
		const dialog = () => screen.getByRole("dialog");
		await waitFor(() => expect(dialog().querySelector(".okm-citation")?.textContent).toContain(crafted));
		await fireEvent.click(screen.getByRole("button", { name: "MLA" }));
		expect(screen.getByRole("button", { name: "MLA" })).toHaveAttribute("aria-pressed", "true");
		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		await fireEvent.click(within("Export"));
		flushSync();
		expect(dialog().querySelector("pre")?.textContent).toContain(`title = {${crafted}}`);
		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		await fireEvent.click(within("PDF"));
		await waitFor(() =>
			expect(dialog().querySelector("iframe")).toHaveAttribute("src", "https://example.org/paper.pdf"),
		);
		expect(container.querySelector("img[src=x]")).toBeNull();
	});

	it("links to the paper when no PDF is found", async () => {
		registerPlugin(pdfPlugin());
		const { map, paper } = mapWith({ oa_state: "1" });
		render(Visualization, { state: map, height: 600 });
		map.openModal("pdf", { paper, resolve: () => null });
		await waitFor(() =>
			expect(screen.getByRole("link", { name: "this website" })).toHaveAttribute("href", paper.outlink),
		);
		expect(screen.getByRole("dialog").querySelector("iframe")).toBeNull();
	});
});
