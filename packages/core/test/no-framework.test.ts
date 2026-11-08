import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// @okmaps/core must stay usable from any framework, or none.
const FRAMEWORKS = /^(svelte|react|react-dom|preact|vue|@vue\/|@angular\/|solid-js|lit)(\/|$)/;
const src = path.join(__dirname, "../src");

function files(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		return e.isDirectory() ? files(p) : [p];
	});
}

describe("@okmaps/core", () => {
	it("is plain TypeScript: no component files", () => {
		const other = files(src).filter((f) => !f.endsWith(".ts") || f.endsWith(".svelte.ts"));
		expect(other).toEqual([]);
	});

	it("imports no UI framework", () => {
		const offending: string[] = [];
		for (const f of files(src)) {
			const text = fs.readFileSync(f, "utf8");
			for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)"([^"]+)"/g)) {
				if (FRAMEWORKS.test(m[1])) offending.push(`${path.relative(src, f)}: ${m[1]}`);
			}
			if (/\$(state|derived|effect|props)\b/.test(text)) offending.push(`${path.relative(src, f)}: Svelte rune`);
		}
		expect(offending).toEqual([]);
	});

	it("depends on no UI framework", () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
		const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
		expect(deps.filter((d) => FRAMEWORKS.test(d))).toEqual([]);
	});
});
