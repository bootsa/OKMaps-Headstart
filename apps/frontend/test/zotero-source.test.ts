import type { FieldSpec } from "@okmaps/ui-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessage } from "../src/messages.ts";
import { chosenLibrary, keptRequest, zoteroConfig, zoteroSourceType } from "../src/zotero-source.ts";
import { fakeFetch } from "./fake-net.ts";

const field = (name: string) => zoteroSourceType.fields.find((f) => f.name === name) as FieldSpec;
const signal = new AbortController().signal;

beforeEach(() => vi.stubGlobal("fetch", vi.fn(fakeFetch)));
afterEach(() => vi.unstubAllGlobals());

describe("Zotero source type", () => {
	it("reads the library from the list or from a pasted link", () => {
		expect(chosenLibrary({ library: "user:45", other_library: "12" })).toEqual({ library: { type: "user", id: "45" } });
		expect(
			chosenLibrary({ library: "other", other_library: "https://www.zotero.org/groups/9/x/collections/ABCD1234" }),
		).toEqual({
			library: { type: "group", id: "9" },
			collection: "ABCD1234",
		});
		expect(
			zoteroConfig({
				library: "other",
				other_library: "https://www.zotero.org/groups/9/x/collections/ABCD1234",
				collection: "",
				subcollections: "on",
				qmode: "everything",
				limit: "5000",
				api_key: " k ",
			}),
		).toEqual({
			library: "group:9",
			collection: "ABCD1234",
			subcollections: true,
			qmode: "everything",
			limit: 1000,
			apiKey: "k",
		});
		expect(zoteroSourceType.defaultName?.({ library: "group:9" })).toBe("Zotero group 9");
	});

	it("lists the key's libraries and the chosen library's collections", async () => {
		expect(await field("library").loadOptions?.({ api_key: "" }, signal)).toEqual([
			{ value: "other", label: "A public library (below)" },
		]);
		expect(await field("library").loadOptions?.({ api_key: "k" }, signal)).toEqual([
			{ value: "user:45", label: "My library (steph)" },
			{ value: "group:4846685", label: "pastas" },
			{ value: "other", label: "Another library (below)" },
		]);
		const collections = await field("collection").loadOptions?.({ library: "group:4846685" }, signal);
		expect(collections?.map((o) => o.value)).toEqual(["", "Q4F7R59G", "8UG7PVLY", "U2VMBBBA"]);
		expect(collections?.[0].label).toBe("The whole library");
		expect(field("collection").dependsOn).toEqual(["api_key", "library", "other_library"]);
	});

	it("checks the library can be read before saving", async () => {
		expect(await zoteroSourceType.check?.({ library: "group:4846685" })).toEqual([]);
		expect((await zoteroSourceType.check?.({ library: "other", other_library: "pastas" }))?.[0]).toMatch(
			/Name a library/,
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("Forbidden", { status: 403 })),
		);
		expect(await zoteroSourceType.check?.({ library: "group:1" })).toEqual([
			"Zotero refused access: this library is private. Add an API key that can read it.",
		]);
	});

	it("searches with or without terms, and keeps the key out of saved maps", () => {
		const s = zoteroSourceType.module({
			id: "a",
			type: "zotero",
			name: "Lab papers",
			config: { library: "group:7", collection: "ABCD1234", api_key: "secret" },
		});
		expect(s.description).toBe("Searches Zotero group 7");
		expect(s.fields?.[0].required).toBeFalsy();
		const req = s.request({ q: "" }, "timeline");
		expect(req).toMatchObject({ service: "zotero", source: "Lab papers", q: "", vis_type: "timeline" });
		expect(req.config.apiKey).toBe("secret");
		expect(s.title({ q: "" })).toBe("Lab papers");
		expect(s.title({ q: "reefs" })).toBe("reefs");
		const kept = keptRequest(req);
		expect(JSON.stringify(kept)).not.toContain("secret");
		expect(kept).toMatchObject({ config: { library: "group:7", collection: "ABCD1234" } });
	});

	it("shows what Zotero said", () => {
		expect(errorMessage(["Zotero access denied"], "Zotero refused access.")).toBe(
			"The map could not be made: Zotero refused access.",
		);
	});
});
