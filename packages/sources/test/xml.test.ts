import { describe, expect, it } from "vitest";
import { findAll, parseXml, textOf } from "../src/xml.js";

describe("parseXml", () => {
	it("keeps and drops whitespace like xml2::read_xml (libxml2 NOBLANKS)", () => {
		// Expected values are xml2::xml_text(xml2::read_xml(x)) in R 4.x.
		const cases: [string, string][] = [
			["<a> </a>", " "],
			["<a>\n  <b>x</b>\n  <c>y</c>\n</a>", "xy"],
			["<a>t <b>x</b>\n  <c>y</c>\n</a>", "t x\n  y\n"],
			["<a><b>x</b> <c>y</c> z</a>", "xy z"],
			["<a><!-- c --> <b>x</b></a>", "x"],
			["<a><b>x</b>&amp; <c>y</c></a>", "x& y"],
			["<a>  &#32; <b/></a>", "    "],
			["<a><![CDATA[ x < y ]]> <b>q</b></a>", " x < y q"],
			["<a><b>x</b>\n</a>", "x"],
			["<a b='1'>\n<c/>\n</a>", ""],
		];
		for (const [xml, text] of cases) expect(textOf(parseXml(xml)), xml).toBe(text);
	});

	it("decodes entities and normalises line ends", () => {
		expect(textOf(parseXml("<a>&lt;&#x2013;&#8212;&quot;&apos;\r\nz&unknown;</a>"))).toBe("<–—\"'\nz&unknown;");
	});

	it("finds paths with parent steps and attribute tests", () => {
		const root = parseXml(`<r><D><L><I t="doi">1</I><I t="pmc">2</I></L><X><L><I t="doi">3</I></L></X></D></r>`);
		expect(findAll(root, './/D/L/I[@t="doi"]').map(textOf)).toEqual(["1"]);
		expect(findAll(root, ".//L/I").map(textOf)).toEqual(["1", "2", "3"]);
		expect(findAll(root.children[0] as never, ".//D/L/I")).toEqual([]);
	});

	it("rejects malformed input", () => {
		expect(() => parseXml("<a><b></a>")).toThrow();
		expect(() => parseXml("<a>")).toThrow();
		expect(() => parseXml("text")).toThrow();
	});
});
