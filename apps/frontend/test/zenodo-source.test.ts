import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/messages.ts";
import { withoutToken, zenodoConfig, zenodoSourceType } from "../src/zenodo-source.ts";

describe("Zenodo source type", () => {
	it("accepts the form's defaults", async () => {
		expect(await zenodoSourceType.check?.({ limit: "100", sort: "bestmatch", type: "" })).toEqual([]);
	});

	it("reads the settings into the adaptor's config", () => {
		expect(
			zenodoConfig({
				community: " https://zenodo.org/communities/dryad ",
				type: "",
				subtype: "article",
				sort: "newest",
				limit: "5000",
				token: " abc ",
				filter: "",
				site: "",
			}),
		).toEqual({ community: "dryad", sort: "newest", limit: 1000, accessToken: "abc" });
		expect(zenodoConfig({ type: "publication", subtype: "article", sort: "bogus", limit: "x" })).toEqual({
			type: "publication",
			subtype: "article",
			limit: 100,
		});
	});

	it("names new sources after their community and type", () => {
		expect(zenodoSourceType.defaultName?.({ community: "dryad", type: "dataset" })).toBe("Zenodo: dryad, Datasets");
		expect(zenodoSourceType.defaultName?.({})).toBe("Zenodo");
	});

	it("refuses broken settings", async () => {
		expect(await zenodoSourceType.check?.({ site: "not a url" })).toHaveLength(1);
		expect(await zenodoSourceType.check?.({ token: "a b" })).toEqual(["The access token must not contain spaces."]);
	});

	it("makes requests named after the person's source, search terms optional in a community", () => {
		const s = zenodoSourceType.module({
			id: "a",
			type: "zenodo",
			name: "Dryad",
			config: { community: "dryad", token: "t" },
		});
		expect(s.description).toBe("Searches the dryad community on zenodo.org");
		expect(s.fields[0].required).toBe(false);
		const req = s.request({ q: " " }, "timeline");
		expect(req).toMatchObject({ service: "zenodo", source: "Dryad", q: "", vis_type: "timeline" });
		expect(req.config.accessToken).toBe("t");
		expect(s.title({ q: "" })).toBe("Dryad");
		const all = zenodoSourceType.module({ id: "b", type: "zenodo", name: "Z", config: {} });
		expect(all.fields[0].required).toBe(true);
	});

	it("keeps maps free of the access token", () => {
		const req = { service: "zenodo" as const, source: "Z", q: "x", config: { accessToken: "secret", limit: 5 } };
		expect(withoutToken(req)).toEqual({ service: "zenodo", source: "Z", q: "x", config: { limit: 5 } });
		expect(req.config.accessToken).toBe("secret");
	});

	it("shows what Zenodo said", () => {
		expect(errorMessage(["Zenodo community not found"], "There is no such Zenodo community.")).toBe(
			"The map could not be made: There is no such Zenodo community.",
		);
	});
});
