import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { precacheList } from "../scripts/sw-plugin.ts";

describe("precacheList", () => {
	it("lists the pages, app assets and the visualisation's tagged files, not source maps or fonts", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "okmaps-sw-"));
		const put = (f: string, body = "x") => {
			fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
			fs.writeFileSync(path.join(dir, f), body);
		};
		for (const f of [
			"index.html",
			"map.html",
			"manifest.webmanifest",
			"assets/a.js",
			"assets/a.js.map",
			"icons/icon.svg",
			"vis/h.js",
			"vis/h.css",
			"vis/fonts/x.woff2",
		])
			put(f);
		put("vis/tags.json", JSON.stringify({ scripts: ["h.js"], styles: ["h.css"] }));
		expect(precacheList(dir).sort()).toEqual(
			[
				"index.html",
				"map.html",
				"manifest.webmanifest",
				"assets/a.js",
				"icons/icon.svg",
				"vis/tags.json",
				"vis/h.css",
				"vis/h.js",
			].sort(),
		);
		fs.rmSync(dir, { recursive: true });
	});
});
