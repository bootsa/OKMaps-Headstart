import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { etl, markDuplicates, parseBaseXml, sanitizeAbstract } from "../src/base/records.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const gz = (p: string) => zlib.gunzipSync(fs.readFileSync(path.join(here, p))).toString("utf8");
const fixtures = fs.readdirSync(path.join(here, "fixtures/base")).map((f) => f.replace(/\.xml\.gz$/, ""));

const FIELDS = [
	"id",
	"relation",
	"identifier",
	"title",
	"paper_abstract",
	"published_in",
	"year",
	"subject_orig",
	"subject",
	"authors",
	"link",
	"oa_state",
	"url",
	"relevance",
	"resulttype",
	"type",
	"typenorm",
	"doi",
	"doi_merge",
	"additional_dois",
	"lang",
	"language",
	"content_provider",
	"coverage",
	"collection",
	"is_duplicate",
	"duplicates",
	"has_dataset",
];

describe.each(fixtures)("BASE records: %s", (name) => {
	for (const visType of ["overview", "timeline"]) {
		it(`match base.R etl + mark_duplicates (${visType})`, () => {
			// test/golden/r/base_records_golden.R on the same response.
			const golden = JSON.parse(gz(`golden/base_records/${name}_${visType}.json.gz`));
			const res = parseBaseXml(gz(`fixtures/base/${name}.xml.gz`));
			expect(res.numFound).toBe(golden.numFound);
			const records = markDuplicates(
				etl(res.docs, { visType }).map((r) => ({ ...r, paper_abstract: sanitizeAbstract(r.paper_abstract) })),
			).map((r) => ({ ...r, has_dataset: r.resulttype.includes("Dataset") }));
			expect(records).toHaveLength(golden.metadata.length);
			records.forEach((r, i) => {
				const g = golden.metadata[i];
				// R's additional_dois is a list column, so the JSON holds a one-element array.
				const value = (f: string) => (!(f in g) ? null : f === "additional_dois" ? g[f][0] : g[f]);
				for (const f of FIELDS) expect((r as Record<string, unknown>)[f], `${r.id} ${f}`).toEqual(value(f));
			});
		});
	}
});
