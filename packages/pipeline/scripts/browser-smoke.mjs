// Builds one known-case map inside a Web Worker in headless Chromium and checks
// that it equals the map built in Node. Proves the package runs in a browser
// with no Node APIs. Usage: node scripts/browser-smoke.mjs [testcase9]

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Playwright: the project's copy if installed, else the global one.
const { chromium } = await import("playwright").catch(
	() => import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")),
);

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? "testcase9";
const casePath = path.resolve(here, `../../../legacy/workers/tests/knowncases/${name}.json`);
const raw = JSON.parse(fs.readFileSync(casePath, "utf8"));
const input = {
	papers: JSON.parse(raw.input_data.metadata),
	content: Object.fromEntries(JSON.parse(raw.input_data.text).map((t) => [t.id, t.content])),
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), "okmaps-smoke-"));
const workerSrc = path.join(out, "worker-entry.ts");
fs.writeFileSync(
	workerSrc,
	`import { buildOverviewMap, loadDefaultResources } from ${JSON.stringify(path.resolve(here, "../src/index.ts"))};
self.onmessage = async (e) => {
  const t0 = performance.now();
  const res = await loadDefaultResources();
  const map = buildOverviewMap(e.data, res, { taxonomySeparator: ";" });
  self.postMessage({ ms: performance.now() - t0, areas: map.documents.map((d) => d.area), xy: map.documents.map((d) => [d.x, d.y]) });
};`,
);
await build({
	entryPoints: [workerSrc],
	bundle: true,
	format: "iife",
	platform: "browser",
	outfile: path.join(out, "worker.js"),
	logLevel: "error",
});
const bytes = fs.statSync(path.join(out, "worker.js")).size;

await build({
	entryPoints: [path.resolve(here, "../src/index.ts")],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: path.join(out, "node.mjs"),
	logLevel: "error",
});
const { buildOverviewMap, loadDefaultResources } = await import(path.join(out, "node.mjs"));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");
const workerCode = fs.readFileSync(path.join(out, "worker.js"), "utf8");
const result = await page.evaluate(
	({ code, input }) =>
		new Promise((resolve, reject) => {
			const w = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
			w.onmessage = (e) => resolve(e.data);
			w.onerror = (e) => reject(new Error(e.message));
			w.postMessage(input);
		}),
	{ code: workerCode, input },
);
await browser.close();
console.log(
	JSON.stringify({
		name,
		workerBundleBytes: bytes,
		browserMs: Math.round(result.ms),
		papers: result.areas.length,
		areas: new Set(result.areas).size,
	}),
);
{
	const node = buildOverviewMap(input, await loadDefaultResources(), { taxonomySeparator: ";" });
	const same = JSON.stringify(node.documents.map((d) => d.area)) === JSON.stringify(result.areas);
	const maxDiff = Math.max(
		...node.documents.map((d, i) => Math.max(Math.abs(d.x - result.xy[i][0]), Math.abs(d.y - result.xy[i][1]))),
	);
	console.log(JSON.stringify({ sameAreasAsNode: same, maxCoordDiff: maxDiff }));
	if (!same || maxDiff > 1e-9) process.exit(1);
}
