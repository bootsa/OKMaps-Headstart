import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOverviewMap, loadDefaultResources } from "@okmaps/pipeline";
import { describe, expect, it } from "vitest";
import {
	addWikipediaIntros,
	checkSparqlConfig,
	DBPEDIA_QUERY,
	errorSummary,
	escapeLiteral,
	type FetchFn,
	fillTemplate,
	fullTextWords,
	retryAfterMs,
	SourceError,
	SPARQL_PRESETS,
	SPARQL_REASONS,
	type SparqlRow,
	searchSparql,
	sparqlMapping,
	sparqlPreset,
	sparqlSelect,
	toSparqlRecords,
	uriLabel,
	wikipediaArticle,
	yearOf,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, "fixtures/sparql", p), "utf8");

interface Call {
	url: string;
	init?: RequestInit;
}

/** A fetch that answers from a list, recording the calls. */
function fakeFetch(answers: (Response | Error | ((call: Call) => Response))[]): FetchFn & { calls: Call[] } {
	const calls: Call[] = [];
	const f = (async (url: string, init?: RequestInit) => {
		const call = { url, init };
		calls.push(call);
		const a = answers.shift();
		if (!a) throw new Error(`no answer left for ${url}`);
		if (a instanceof Error) throw a;
		return typeof a === "function" ? a(call) : a;
	}) as FetchFn & { calls: Call[] };
	f.calls = calls;
	return f;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/sparql-results+json", ...headers },
	});

const results = (vars: string[], rows: Record<string, string>[]) =>
	json({
		head: { vars },
		results: {
			bindings: rows.map((r) =>
				Object.fromEntries(
					Object.entries(r).map(([k, v]) => [k, { type: /^https?:/.test(v) ? "uri" : "literal", value: v }]),
				),
			),
		},
	});

describe("query templates", () => {
	it("escapes the search terms so they cannot end the string", () => {
		const q = fillTemplate('SELECT * WHERE { ?s ?p "{{q}}" } LIMIT {{limit}}', {
			q: ' x" } ; DROP ALL ; { "',
			limit: 50,
			lang: "en",
		});
		expect(q).toBe('SELECT * WHERE { ?s ?p "x\\" } ; DROP ALL ; { \\"" } LIMIT 50');
		expect(escapeLiteral("a\\b\n'c'")).toBe("a\\\\b\\n\\'c\\'");
	});

	it("fills limit and lang, refusing odd values", () => {
		const t = "{{ lang }} {{limit}}";
		expect(fillTemplate(t, { q: "", limit: 20.7, lang: "de" })).toBe("de 20");
		expect(fillTemplate(t, { q: "", limit: Number.NaN, lang: 'en" }' })).toBe("en 100");
	});

	it("makes Virtuoso full-text words", () => {
		expect(fullTextWords('coral  reef\'s "bleaching" (2016)')).toBe("'coral' AND 'reefs' AND 'bleaching' AND '2016'");
		expect(fillTemplate('bif:contains "{{q_words}}"', { q: "sea-level rise", limit: 1, lang: "en" })).toBe(
			"bif:contains \"'sea-level' AND 'rise'\"",
		);
	});

	it("names unknown placeholders", () => {
		expect(() => fillTemplate("{{query}}", { q: "a", limit: 1, lang: "en" })).toThrow("{{query}}");
	});

	it("checks a config before it is saved", () => {
		expect(checkSparqlConfig({ endpoint: "https://query.wikidata.org/sparql", query: 'SELECT * { "{{q}}" }' })).toEqual(
			[],
		);
		expect(checkSparqlConfig({ endpoint: "ftp://x", query: "ASK { {{qq}} }" })).toEqual([
			"The endpoint must be an http(s) URL.",
			"The query must be a SELECT query.",
			"The query must use the search terms: {{q}} or {{q_words}}.",
			"Unknown placeholders: {{qq}}.",
		]);
		for (const p of SPARQL_PRESETS) expect(checkSparqlConfig(p.config), p.id).toEqual([]);
	});
});

describe("records", () => {
	it("merges rows of one item and maps variables", () => {
		const rows: SparqlRow[] = [
			{
				item: "http://www.wikidata.org/entity/Q1",
				name: "Coral bleaching",
				desc: "loss of algae",
				topic: "http://dbpedia.org/resource/Category:Coral_reefs",
				when: "2016-03-01T00:00:00Z",
				who: "Ann Smith",
			},
			{
				item: "http://www.wikidata.org/entity/Q1",
				name: "ignored",
				topic: "climate change | Coral reefs",
				when: "1998-01-01T00:00:00Z",
				who: "Bo Li; Ann Smith",
			},
			{ item: "http://www.wikidata.org/entity/Q2", name: "Reef", doi: "https://doi.org/10.1000/XYZ.1" },
		];
		const mapping = sparqlMapping({ title: "name", abstract: "?desc", subject: "topic", year: "when", authors: "who" });
		const { papers, content } = toSparqlRecords(rows, mapping);
		expect(papers).toHaveLength(2);
		expect(papers[0]).toMatchObject({
			id: "http://www.wikidata.org/entity/Q1",
			title: "Coral bleaching",
			paper_abstract: "loss of algae",
			subject: "Coral reefs; climate change",
			authors: "Ann Smith; Bo Li",
			year: "1998",
			url: "http://www.wikidata.org/entity/Q1",
			doi: "",
		});
		expect(papers[1]).toMatchObject({ title: "Reef", doi: "10.1000/xyz.1", paper_abstract: null, year: null });
		expect(content["http://www.wikidata.org/entity/Q1"]).toBe(
			"Coral bleaching loss of algae Coral reefs; climate change",
		);
	});

	it("reads years and URI labels", () => {
		expect(yearOf("2016-03-01T00:00:00Z")).toBe("2016");
		expect(yearOf("-0500-01-01T00:00:00Z")).toBe("-500");
		expect(yearOf("1850")).toBe("1850");
		expect(yearOf("circa")).toBe("");
		expect(uriLabel("http://dbpedia.org/resource/Category:Coral_reefs")).toBe("Coral reefs");
		expect(uriLabel("http://example.org/ns#Caf%C3%A9_society")).toBe("Café society");
	});

	it("maps a real DBpedia answer", () => {
		const body = JSON.parse(read("dbpedia-coral-reef.json"));
		const rows = body.results.bindings.map((b: Record<string, { value: string }>) =>
			Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])),
		);
		const { papers } = toSparqlRecords(rows);
		expect(papers.length).toBe(new Set(rows.map((r: { item: string }) => r.item)).size);
		const adventure = papers.find((p) => p.title === "Coral Reef Adventure");
		expect(adventure?.url).toBe("http://en.wikipedia.org/wiki/Coral_Reef_Adventure");
		expect(adventure?.subject).toContain("Films set underwater");
	});
});

describe("sparqlSelect", () => {
	const endpoint = "https://query.example.org/sparql";

	it("asks for SPARQL JSON with a GET, POST for long queries", async () => {
		const f = fakeFetch([results(["a"], [{ a: "1" }]), results(["a"], [])]);
		const r = await sparqlSelect(endpoint, "SELECT ?a {}", { fetch: f });
		expect(r.rows).toEqual([{ a: "1" }]);
		expect(f.calls[0].url).toBe(`${endpoint}?query=${encodeURIComponent("SELECT ?a {}")}`);
		expect(new Headers(f.calls[0].init?.headers).get("Accept")).toBe("application/sparql-results+json");
		await sparqlSelect(endpoint, `SELECT ?a { ${"?s ?p ?o . ".repeat(300)} }`, { fetch: f });
		expect(f.calls[1].init?.method).toBe("POST");
		expect(String(f.calls[1].init?.body)).toMatch(/^query=SELECT/);
		// No custom headers, so a browser sends no CORS preflight.
		expect(new Headers(f.calls[1].init?.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
	});

	it("waits for a short Retry-After once", async () => {
		const f = fakeFetch([new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }), results([], [])]);
		await expect(sparqlSelect(endpoint, "SELECT * {}", { fetch: f })).resolves.toMatchObject({ rows: [] });
		expect(f.calls).toHaveLength(2);
	});

	it("explains a long rate limit (Wikimedia's error page)", async () => {
		const f = fakeFetch([new Response(read("wikimedia-429.html"), { status: 429, headers: { "Retry-After": "60" } })]);
		const err = await sparqlSelect(endpoint, "SELECT * {}", { fetch: f }).catch((e) => e);
		expect(err).toBeInstanceOf(SourceError);
		expect(err.reasons).toEqual([SPARQL_REASONS.rateLimited]);
		expect(err.message).toContain("Try again in 60 s");
		expect(err.message).toContain("Aggressively rate-limiting to 1 req / min");
		expect(err.message).not.toContain("192.0.2.1");
	});

	it("reports query errors with the useful line", async () => {
		const body =
			'SPARQL-QUERY: queryStr=SELECT\njava.util.concurrent.ExecutionException: org.openrdf.query.MalformedQueryException: Encountered " "}" "} "" at line 1, column 10.\n\tat java.util';
		const f = fakeFetch([new Response(body, { status: 400 })]);
		const err = await sparqlSelect(endpoint, "SELECT * {", { fetch: f }).catch((e) => e);
		expect(err.reasons).toEqual([SPARQL_REASONS.queryError]);
		expect(err.message).toContain('Encountered " "}" "} "" at line 1, column 10.');
		expect(errorSummary("Virtuoso 37000 Error SP030: SPARQL compiler, line 1: syntax error")).toBe(
			"SPARQL compiler, line 1: syntax error",
		);
	});

	it("reports timeouts", async () => {
		const f = fakeFetch([new Response("java.util.concurrent.TimeoutException", { status: 500 })]);
		const err = await sparqlSelect(endpoint, "SELECT * {}", { fetch: f }).catch((e) => e);
		expect(err.reasons).toEqual([SPARQL_REASONS.timeout]);
		const hang: FetchFn = (_u, init) =>
			new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
		const err2 = await sparqlSelect(endpoint, "SELECT * {}", { fetch: hang, timeoutMs: 10 }).catch((e) => e);
		expect(err2.reasons).toEqual([SPARQL_REASONS.timeout]);
	});

	it("says CORS when the endpoint cannot be reached", async () => {
		const f = fakeFetch([new TypeError("Failed to fetch"), new TypeError("Failed to fetch")]);
		const err = await sparqlSelect(endpoint, "SELECT * {}", { fetch: f, attempts: 2 }).catch((e) => e);
		expect(err.reasons).toEqual([SPARQL_REASONS.unreachable]);
		expect(err.message).toContain("CORS");
		expect(f.calls).toHaveLength(2);
	});

	it("passes extra headers and explains a refusal", async () => {
		const f = fakeFetch([new Response("Please set a user-agent", { status: 403 })]);
		const err = await sparqlSelect(endpoint, "SELECT * {}", { fetch: f, headers: { "User-Agent": "test/1" } }).catch(
			(e) => e,
		);
		expect(new Headers(f.calls[0].init?.headers).get("User-Agent")).toBe("test/1");
		expect(err.message).toBe("The endpoint refused the request (403): Please set a user-agent");
		expect(err.reasons).toEqual([SPARQL_REASONS.unreachable]);
	});

	it("refuses answers that are not SELECT results", async () => {
		const f = fakeFetch([new Response("<html>hi</html>"), json({ head: {}, boolean: true })]);
		const e1 = await sparqlSelect(endpoint, "SELECT * {}", { fetch: f }).catch((e) => e);
		expect(e1.reasons).toEqual([SPARQL_REASONS.badResponse]);
		const e2 = await sparqlSelect(endpoint, "ASK {}", { fetch: f }).catch((e) => e);
		expect(e2.message).toContain("SELECT");
	});

	it("reads Retry-After dates", () => {
		expect(retryAfterMs("120")).toBe(120_000);
		expect(retryAfterMs("Sun, 08 Nov 2026 17:40:00 GMT", Date.parse("Sun, 08 Nov 2026 17:39:30 GMT"))).toBe(30_000);
		expect(retryAfterMs(null)).toBeNull();
	});
});

describe("Wikipedia introductions", () => {
	it("finds articles in URLs", () => {
		expect(wikipediaArticle("https://en.wikipedia.org/wiki/Coral_bleaching")).toEqual({
			lang: "en",
			title: "Coral bleaching",
		});
		expect(wikipediaArticle("http://de.m.wikipedia.org/wiki/K%C3%B6ln?x=1")).toEqual({ lang: "de", title: "Köln" });
		expect(wikipediaArticle("https://www.wikidata.org/wiki/Q1")).toBeNull();
	});

	it("fills short abstracts, following redirects, and survives failures", async () => {
		const { papers } = toSparqlRecords([
			{
				item: "Q1",
				title: "Coral bleaching",
				abstract: "loss of algae",
				url: "https://en.wikipedia.org/wiki/Coral_bleaching",
			},
			{ item: "Q2", title: "Reef", url: "https://en.wikipedia.org/wiki/Reefs" },
			{ item: "Q3", title: "Köln", url: "https://de.wikipedia.org/wiki/K%C3%B6ln" },
			{ item: "Q4", title: "No article", url: "https://example.org/x" },
		]);
		const f = fakeFetch([
			(call) => {
				const u = new URL(call.url);
				expect(u.host).toBe("en.wikipedia.org");
				expect(u.searchParams.get("origin")).toBe("*");
				expect(u.searchParams.get("titles")).toBe("Coral bleaching|Reefs");
				return new Response(
					JSON.stringify({
						query: {
							redirects: [{ from: "Reefs", to: "Reef" }],
							pages: [
								{ title: "Coral bleaching", extract: "Coral bleaching is the process when corals become white." },
								{ title: "Reef", extract: "A reef is a ridge.\n\nMore." },
							],
						},
					}),
				);
			},
			new TypeError("Failed to fetch"),
		]);
		expect(await addWikipediaIntros(papers, { fetch: f })).toBe(2);
		expect(papers[0].paper_abstract).toBe("loss of algae. Coral bleaching is the process when corals become white.");
		expect(papers[1].paper_abstract).toBe("A reef is a ridge. More.");
		expect(papers[2].paper_abstract).toBeNull();
		expect(f.calls).toHaveLength(2);
	});
});

describe("searchSparql", () => {
	it("runs a preset and makes a map", async () => {
		const preset = sparqlPreset("dbpedia");
		expect(preset?.config.query).toBe(DBPEDIA_QUERY);
		const fixture = read("dbpedia-coral-reef.json");
		const f = fakeFetch([
			(call) => {
				const query = new URL(call.url).searchParams.get("query") ?? "";
				expect(query).toContain("bif:contains \"'coral' AND 'reef'\"");
				expect(query).toContain("LIMIT 100");
				return new Response(fixture);
			},
			...Array.from({ length: 5 }, () => new Response("{}")),
		]);
		const result = await searchSparql(preset!.config, { q: "coral reef" }, { fetch: f });
		expect(result.service).toBe("sparql");
		expect(result.papers.length).toBeGreaterThan(20);
		const map = buildOverviewMap(
			{ papers: result.papers, content: result.content, service: "sparql" },
			await loadDefaultResources(),
			{ taxonomySeparator: ";" },
		);
		expect(map.documents.length).toBe(result.papers.length);
		expect(new Set(map.documents.map((d) => d.area)).size).toBeGreaterThan(1);
	});

	it("runs the Wikidata preset (a real answer)", async () => {
		const f = fakeFetch([
			(call) => {
				// A long query goes as a form POST.
				const query = new URLSearchParams(String(call.init?.body)).get("query") ?? "";
				expect(query).toContain('mwapi:gsrsearch "coral bleaching -haswbstatement:P31=Q13442814"');
				return new Response(read("wikidata-coral-bleaching.json"));
			},
		]);
		const result = await searchSparql(sparqlPreset("wikidata")!.config, { q: "coral bleaching" }, { fetch: f });
		expect(f.calls).toHaveLength(1);
		const first = result.papers[0];
		expect(first).toMatchObject({
			id: "http://www.wikidata.org/entity/Q568916",
			title: "coral bleaching",
			url: "http://www.wikidata.org/entity/Q568916",
		});
		expect(first.paper_abstract).toContain("zooxanthallae");
		expect(result.papers.every((p) => p.title)).toBe(true);
		expect(result.papers.some((p) => p.subject)).toBe(true);
	});

	it("leaves out records without a title", async () => {
		const f = fakeFetch([results(["item", "title"], [{ item: "http://x/1", title: "One" }, { item: "http://x/2" }])]);
		const r = await searchSparql(
			{ endpoint: "https://x.org/sparql", query: 'SELECT * { "{{q}}" }' },
			{ q: "a" },
			{ fetch: f },
		);
		expect(r.papers.map((p) => p.id)).toEqual(["http://x/1"]);
		expect(Object.keys(r.content)).toEqual(["http://x/1"]);
	});

	it("says which variables there are when no title is mapped", async () => {
		const f = fakeFetch([results(["thing", "name"], [{ thing: "http://x/1", name: "One" }])]);
		const err = await searchSparql(
			{ endpoint: "https://x.org/sparql", query: 'SELECT * { "{{q}}" }' },
			{ q: "a" },
			{ fetch: f },
		).catch((e) => e);
		expect(err.message).toContain("thing, name");
	});

	it("refuses a broken config without a request", async () => {
		const f = fakeFetch([]);
		const err = await searchSparql({ endpoint: "nope", query: "SELECT *" }, { q: "a" }, { fetch: f }).catch((e) => e);
		expect(err.reasons).toEqual([SPARQL_REASONS.queryError]);
		expect(f.calls).toHaveLength(0);
	});
});
