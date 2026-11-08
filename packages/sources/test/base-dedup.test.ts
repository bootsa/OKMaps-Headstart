import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { filterDuplicates } from "../src/base/dedup.js";
import { finalizeBaseRecords } from "../src/base/finalize.js";
import { etl, markDuplicates, parseBaseXml, sanitizeAbstract } from "../src/base/records.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const gz = (p: string) => zlib.gunzipSync(fs.readFileSync(path.join(here, p))).toString("utf8");
const fixtures = fs.readdirSync(path.join(here, "fixtures/base")).map((f) => f.replace(/\.xml\.gz$/, ""));
const providers = new Map<string, string>(
	JSON.parse(gz("fixtures/contentproviders.json.gz")).map((r: { name: string; internal_name: string }) => [
		r.name,
		r.internal_name,
	]),
);

const FIELDS = [
	"id",
	"title",
	"paper_abstract",
	"published_in",
	"year",
	"subject_orig",
	"subject",
	"authors",
	"link",
	"oa_state",
	"relevance",
	"resulttype",
	"typenorm",
	"doi",
	"doi_merge",
	"additional_dois",
	"content_provider",
	"collection",
	"is_duplicate",
	"has_dataset",
	"sanitized_authors",
	"pdf_link_candidates_from_duplicates",
	"relations",
	"annotations",
	"repo",
	"source",
	"volume",
	"issue",
	"page",
	"issn",
];

describe.each(fixtures)("BASE worker: %s", (name) => {
	for (const [visType, listSize] of [
		["overview", 100],
		["timeline", 100],
		["overview", 60],
		["timeline", 60],
	] as const) {
		it(`matches BaseClient.execute_search (${visType}, list_size ${listSize})`, () => {
			// test/golden/py/base_worker_golden.py on the R output for the same response.
			const suffix = listSize === 100 ? "" : `_list${listSize}`;
			const golden = JSON.parse(gz(`golden/base_worker/${name}_${visType}${suffix}.json.gz`));
			const res = parseBaseXml(gz(`fixtures/base/${name}.xml.gz`));
			const marked = markDuplicates(
				etl(res.docs, { visType }).map((r) => ({ ...r, paper_abstract: sanitizeAbstract(r.paper_abstract) })),
			).map((r) => ({ ...r, has_dataset: r.resulttype.includes("Dataset") }));
			const { papers, content } = finalizeBaseRecords(filterDuplicates(marked), {
				listSize,
				contentProviders: providers,
			});
			expect(papers.map((p) => p.id)).toEqual(golden.metadata.map((g: { id: string }) => g.id));
			papers.forEach((p, i) => {
				const g = golden.metadata[i];
				const value = (f: string) => {
					const v = g[f];
					if (v === undefined) return null;
					return f === "additional_dois" && Array.isArray(v) ? v[0] : v;
				};
				for (const f of FIELDS) expect((p as Record<string, unknown>)[f] ?? null, `${p.id} ${f}`).toEqual(value(f));
			});
			expect(papers.map((p) => content[p.id])).toEqual(golden.text.map((t: { content: string }) => t.content));
		});
	}
});
