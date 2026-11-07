import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	buildStreamgraph,
	recordYear,
	type StreamgraphData,
	StreamgraphError,
	type StreamgraphPaper,
	streamgraphDocuments,
	streamgraphTokens,
} from "../src/streamgraph/index.js";

// Goldens from the old Python step: test/golden/py/streamgraph_golden.py
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden/streamgraph");
interface Case {
	name: string;
	query: string;
	method: "count" | "tfidf";
	n: number;
	metadata: StreamgraphPaper[];
	streamgraph?: StreamgraphData;
	reduced_ids?: string[];
	error?: string;
}
const cases: Case[] = fs
	.readdirSync(dir)
	.filter((f) => f.endsWith(".json.gz"))
	.sort()
	.map((f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString("utf8")));

const run = (c: Case) => buildStreamgraph(c.metadata, { query: c.query, topN: c.n, method: c.method });

describe("buildStreamgraph matches the Python step", () => {
	const ok = cases.filter((c) => c.streamgraph);
	it("has goldens", () => expect(ok.length).toBeGreaterThan(25));

	it.each(ok.map((c) => [c.name, c] as const))("%s", (_, c) => {
		const out = run(c);
		expect(out).toEqual(c.streamgraph);
		const ids = streamgraphDocuments(c.metadata, out).map((p) => String(p.id));
		// Python reads PubMed's numeric ids back as numbers and then keeps no
		// record; the port keeps the records in the streams.
		if (c.reduced_ids!.length === 0 && out.subject.length > 0) {
			expect(new Set(ids)).toEqual(new Set(out.subject.flatMap((s) => s.ids_overall)));
		} else {
			expect(ids).toEqual(c.reduced_ids);
		}
	});

	it.each(cases.filter((c) => c.error === "ValueError").map((c) => [c.name, c] as const))(
		"%s fails as in Python",
		(_, c) => {
			expect(() => run(c)).toThrow(StreamgraphError);
		},
	);

	it("skips a record without a subject line, where Python fails", () => {
		const none = cases.find((c) => c.name === "edge_none")!;
		const mixed = cases.find((c) => c.name === "edge_mixed")!;
		expect(none.error).toBe("TypeError");
		expect(run(none)).toEqual(mixed.streamgraph);
	});
});

describe("parts", () => {
	it("splits keywords like the old tokenizer", () => {
		expect(streamgraphTokens("Hello (world); Test; (example)")).toEqual(["Hello world", "Test", "example"]);
		expect(streamgraphTokens("a;b; c; ")).toEqual(["ab", "c", ""]);
	});

	it("reads years as pandas did", () => {
		const cases: Array<[unknown, number | null]> = [
			["2019", 2019],
			[" 2019 ", 2019],
			["2019-05", 2019],
			["2019-1-1", 2019],
			["2019-05-01", 2019],
			["2019-05-01 10:00", 2019],
			["2014-01-01T00:00:00Z", 2014],
			["2016-12-31T23:30:00-05:00", 2017],
			["2017-01-01T01:00:00+02:00", 2016],
			["2019/05/01", 2019],
			["20190501", 2019],
			["2017 Jun 15", 2017],
			["2017 Sept", 2017],
			["Sep 2017", 2017],
			["2017-02-29", null],
			["2016-02-29", 2016],
			["2017 Feb 30", null],
			["2019-13", null],
			["2017 Apr-Jun", null],
			["2017 Apr 3-10", null],
			["2017-05-01T10:00:00Z-", null],
			["not a year", null],
			["", null],
			[null, null],
		];
		for (const [value, year] of cases) expect([value, recordYear(value)]).toEqual([value, year]);
	});

	it("fails without records", () => {
		expect(() => buildStreamgraph([])).toThrow(StreamgraphError);
	});
});
