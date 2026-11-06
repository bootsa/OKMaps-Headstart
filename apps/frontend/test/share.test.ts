import { createGateway, memoryStore } from "@okmaps/gateway";
import { describe, expect, it } from "vitest";
import { fetchSharedMap, neutralise, publishMap, type SharedMap } from "../src/share.ts";

const GW = "https://gateway.test";

const map: SharedMap = {
	title: "ecology",
	context: { id: "c1", query: "ecology", service: "pubmed", timestamp: "2026-11-06 10:00:00", params: "{}" },
	documents: [{ id: "d1", area: "Plants", title: "A paper", x: "0.1", y: "-0.2" }],
};

/** A fetch that answers from a real gateway with an in-memory store. */
function gatewayFetch() {
	const handler = createGateway({ baseApiKey: "k", allowedOrigins: ["*"], maps: { store: memoryStore() } });
	return (async (input: string | URL | Request, init?: RequestInit) =>
		handler(new Request(String(input), init), { address: "1.2.3.4" })) as typeof fetch;
}

// Enough of HTML entity decoding for the tests.
const decode = (s: string) =>
	s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&amp;/g, "&");

describe("share links", () => {
	it("publishes a map and reads it back", async () => {
		const f = gatewayFetch();
		const id = await publishMap(GW, map, f);
		expect(id).toMatch(/^[0-9a-f]{24}$/);
		expect(await publishMap(GW, map, f)).toBe(id);
		expect(await fetchSharedMap(GW, id, f)).toEqual(map);
	});

	it("answers null for unknown or malformed ids", async () => {
		const f = gatewayFetch();
		expect(await fetchSharedMap(GW, "0".repeat(24), f)).toBeNull();
		expect(await fetchSharedMap(GW, "../etc/passwd", f)).toBeNull();
	});

	it("reports the gateway's reason when publishing fails", async () => {
		const f = gatewayFetch();
		await expect(publishMap(GW, { ...map, documents: [] }, f)).rejects.toThrow(/documents/);
	});

	it("neutralises markup, also when entity-encoded several times", () => {
		const out = neutralise(
			{
				title: "<img src=x onerror=alert(1)>",
				documents: [{ area: "&amp;lt;script&amp;gt;x&amp;lt;/script&amp;gt;", n: 3, tags: ["a &amp; b"] }],
			},
			decode,
		);
		expect(out.title).toBe("‹img src=x onerror=alert(1)›");
		expect(out.documents[0].area).toBe("‹script›x‹/script›");
		expect(out.documents[0].n).toBe(3);
		expect(out.documents[0].tags).toEqual(["a ＆ b"]);
		expect(JSON.stringify(out)).not.toMatch(/[<>&]/);
	});
});
