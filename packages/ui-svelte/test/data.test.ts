import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapConfig } from "../src/data/config";
import { listPapers, searchWords } from "../src/data/filter";
import { decodeEntities, parseAuthors, processPaper, safeId } from "../src/data/papers";
import { processMap, resizeMap } from "../src/data/process";
import type { MapRecord } from "../src/data/types";
import { strings } from "../src/i18n/strings";

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
// A BASE map from the pipeline (60 papers of known case 3), and what the old
// DataManager made of it at 600 px (packages/ui, written once).
const record: MapRecord = fixture("base-map.json");
const legacy = fixture("base-map.legacy.json");

describe("processMap", () => {
	const map = processMap(record, 600);
	const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 2);

	it("makes one area per area_uri, placed and sized as the old visualisation did", () => {
		expect(map.areas).toHaveLength(legacy.areas.length);
		for (const old of legacy.areas) {
			const area = map.areas.find((a) => a.uri === old.area_uri)!;
			expect(area.title).toBe(old.title);
			expect(area.papers).toHaveLength(old.n);
			close(area.x, old.x);
			close(area.y, old.y);
			close(area.r, old.r);
		}
	});

	it("sizes papers and fills in their metadata like the old visualisation", () => {
		expect(map.papers).toHaveLength(legacy.papers.length);
		map.papers.forEach((p, i) => {
			const old = legacy.papers[i];
			expect(p.safeId).toBe(old.safe_id);
			expect(p.title).toBe(old.title);
			expect(p.authorsString).toBe(old.authors_string);
			expect(p.year).toBe(old.year);
			expect(p.oa).toBe(old.oa);
			expect(p.outlink).toBe(old.outlink);
			expect(p.listLink).toEqual(old.list_link);
			expect(p.internalReaders).toBe(old.internal_readers);
			close(p.diameter, old.diameter);
			close(p.width, old.width);
			close(p.height, old.height);
		});
	});

	it("keeps every paper inside the chart", () => {
		for (const p of map.papers) {
			expect(p.x).toBeGreaterThanOrEqual(5);
			expect(p.x).toBeLessThanOrEqual(595);
			expect(p.y).toBeGreaterThanOrEqual(5);
			expect(p.y).toBeLessThanOrEqual(595);
		}
	});

	it("rescales for another chart size", () => {
		const m = processMap(record, 600);
		const before = { ...m.areas[0] };
		resizeMap(m, 300);
		expect(m.size).toBe(300);
		close(m.areas[0].x, before.x / 2);
		close(m.areas[0].r, before.r / 2);
	});

	it("copes with an empty map and a one-paper map", () => {
		expect(processMap({ context: { service: "base" }, documents: [] }, 600).areas).toEqual([]);
		const one = processMap({ context: { service: "base" }, documents: [record.documents[0]] }, 600);
		expect(one.areas).toHaveLength(1);
		expect(Number.isFinite(one.areas[0].r)).toBe(true);
		expect(one.papers[0].x).toBe(300);
	});
});

describe("processPaper", () => {
	const s = strings("eng");
	const base = mapConfig("base");
	const pubmed = mapConfig("pubmed");

	it("fills in fallbacks for missing fields", () => {
		const p = processPaper({ id: "a b/c" }, base, s, {});
		expect(p.title).toBe("No title available");
		expect(p.abstract).toBe("No abstract available");
		expect(p.keywords).toBe("not available");
		expect(p.area).toBe("No area title available");
		expect(p.safeId).toBe("a-b__002fc");
	});

	it("keeps crafted HTML as text", () => {
		const p = processPaper({ id: "1", title: '<img src=x onerror="alert(1)">', area: "&lt;b&gt;x" }, base, s, {});
		expect(p.title).toBe('<img src=x onerror="alert(1)">');
		expect(p.area).toBe("<b>x");
	});

	it("uses PMC ids for PubMed open access and links", () => {
		const p = processPaper({ id: "1", pmcid: "PMC1", url: "123", readers: "4" }, pubmed, strings("eng_pubmed"), {});
		expect(p.oa).toBe(true);
		expect(p.oaLink).toBe("http://www.ncbi.nlm.nih.gov/pmc/articles/PMC1/pdf/");
		expect(p.internalReaders).toBe(5);
		expect(processPaper({ id: "2" }, pubmed, s, {}).oa).toBe(false);
	});

	it("links to the DOI when there is one", () => {
		expect(processPaper({ id: "1", doi: "10.1/x" }, base, s, {}).listLink).toEqual({
			address: "https://doi.org/10.1/x",
			isDoi: true,
		});
		expect(processPaper({ id: "1", doi: "https://doi.org/10.1/x" }, base, s, {}).listLink?.address).toBe(
			"https://doi.org/10.1/x",
		);
	});

	it("shortens more than 20 authors", () => {
		const authors = Array.from({ length: 25 }, (_, i) => `Last${i}, First${i}`).join("; ");
		const p = processPaper({ id: "1", authors }, base, s, {});
		expect(p.authorsList).toHaveLength(21);
		expect(p.authorsString.endsWith(", ... First24 Last24")).toBe(true);
	});

	it("parses authors and decodes entities", () => {
		expect(parseAuthors("Doe, Jane; Smith")).toEqual([{ firstName: "Jane", lastName: "Doe" }, { lastName: "Smith" }]);
		expect(decodeEntities("A &amp; B &#39;c&#x27; &bogus;")).toBe("A & B 'c' &bogus;");
		expect(safeId("x y")).toBe("x-y");
	});
});

describe("listPapers", () => {
	const map = processMap(record, 600);
	const all = { search: "", filter: "all", sort: "title" };

	it("sorts by title, and by relevance descending", () => {
		const titles = listPapers(map.papers, all).map((p) => p.title.toLowerCase());
		expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
		const rel = listPapers(map.papers, { ...all, sort: "relevance" }).map((p) => p.relevance);
		expect(rel).toEqual([...rel].sort((a, b) => b - a));
	});

	it("searches all words in title, authors, keywords and abstract", () => {
		const hits = listPapers(map.papers, { ...all, search: "stuff" });
		expect(hits.length).toBeGreaterThan(0);
		expect(hits.length).toBeLessThan(map.papers.length);
		expect(listPapers(map.papers, { ...all, search: "stuff zzzzqq" })).toEqual([]);
	});

	it("filters open access, one area and one paper", () => {
		expect(listPapers(map.papers, { ...all, filter: "open_access" }).every((p) => p.oa)).toBe(true);
		const uri = map.areas[0].uri;
		expect(listPapers(map.papers, { ...all, area: uri })).toHaveLength(map.areas[0].papers.length);
		const id = map.papers[3].safeId;
		expect(listPapers(map.papers, { ...all, paper: id }).map((p) => p.safeId)).toEqual([id]);
	});

	it("ignores case and accents, and splits at any white space", () => {
		expect(searchWords("  Müller\tCAFÉ\u00a0naïve ")).toEqual(["muller", "cafe", "naive"]);
		const p = map.papers[0];
		const papers = [{ ...p, title: "Ökologie der Küste", authorsString: "Zoë Müller" }, ...map.papers.slice(1)];
		const hit = (search: string) => listPapers(papers, { ...all, search }).map((x) => x.safeId);
		expect(hit("okologie")).toEqual([p.safeId]);
		expect(hit("KUSTE muller")).toEqual([p.safeId]);
		expect(hit("zoe")).toEqual([p.safeId]);
		// A decomposed ü (u + combining diaeresis) matches too.
		expect(hit("mu\u0308ller")).toEqual([p.safeId]);
	});
});
