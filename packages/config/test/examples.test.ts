import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURES, resolveConfig } from "../src/index.ts";

const dir = new URL("../examples/", import.meta.url);
const schema = JSON.parse(fs.readFileSync(new URL("../schema.json", import.meta.url), "utf8"));

describe("example configs", () => {
	for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json")))
		it(`${name} is fine`, () => {
			const r = resolveConfig(JSON.parse(fs.readFileSync(new URL(name, dir), "utf8")), { env: {} });
			expect(r.errors).toEqual([]);
			expect(r.secrets).toEqual([]);
		});
});

describe("schema.json", () => {
	it("knows every feature", () => {
		expect(Object.keys(schema.properties.features.properties).sort()).toEqual(Object.keys(DEFAULT_FEATURES).sort());
	});
});
