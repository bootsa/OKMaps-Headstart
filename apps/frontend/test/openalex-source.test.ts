import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/messages.ts";
import { openalexConfig, openalexSecrets, openalexSourceType } from "../src/openalex-source.ts";

describe("OpenAlex source type", () => {
	it("offers presets that pass the check", async () => {
		expect(openalexSourceType.presets?.map((p) => p.id)).toEqual(["all", "oa-articles"]);
		for (const p of openalexSourceType.presets ?? []) expect(await openalexSourceType.check?.(p.config)).toEqual([]);
	});

	it("reads the settings, keeping the key and address out of the config", () => {
		const c = openalexConfig({
			api_key: "k",
			email: "a@b.org",
			search_in: "title",
			limit: "5000",
			filter: " is_oa:true ",
		});
		expect(c).toEqual({ searchIn: "title", limit: 1000, filter: "is_oa:true" });
		expect(openalexConfig({ search_in: "bogus", limit: "" })).toEqual({ searchIn: "all", limit: 100 });
	});

	it("collects the secrets of OpenAlex sources only", () => {
		expect(
			openalexSecrets([
				{ id: "a", type: "openalex", name: "A", config: { api_key: " k ", email: "" } },
				{ id: "b", type: "sparql", name: "B", config: { api_key: "no" } },
			]),
		).toEqual({ a: { apiKey: "k" } });
	});

	it("refuses bad filters and addresses", async () => {
		const problems = await openalexSourceType.check?.({ filter: "is_oa=true", email: "nope" });
		expect(problems).toHaveLength(2);
	});

	it("makes requests named after the person's source, without its key", () => {
		const s = openalexSourceType.module({
			id: "oa1",
			type: "openalex",
			name: "OA articles",
			config: { api_key: "SECRET", filter: "is_oa:true", search_in: "all", limit: "50" },
		});
		expect(s.description).toBe("OpenAlex works where is_oa:true");
		const req = s.request({ q: " coral ", from: "2010-01-01", to: "", sorting: "most-cited" }, "timeline");
		expect(req).toEqual({
			service: "openalex",
			source: "OA articles",
			sourceId: "oa1",
			config: { searchIn: "all", limit: 50, filter: "is_oa:true" },
			q: "coral",
			from: "2010-01-01",
			to: "",
			sorting: "most-cited",
			vis_type: "timeline",
		});
		expect(JSON.stringify(req)).not.toContain("SECRET");
	});

	it("shows what OpenAlex said", () => {
		expect(errorMessage(["API error: OpenAlex rate limited"], "OpenAlex gets too many requests")).toBe(
			"The map could not be made: OpenAlex gets too many requests",
		);
	});
});
