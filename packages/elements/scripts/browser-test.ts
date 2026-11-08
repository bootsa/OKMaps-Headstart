// Checks the built bundle (pnpm build) in headless Chromium with the plain-HTML
// example: no framework, no build step on the page. The map draws, its
// methods and events work, the core draws a list of its own, and nothing
// fails on the console. Screenshots go to test-results/.

import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Playwright: the global copy (whose browser is installed) if there is one, else the project's.
const { chromium } = (await import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")).catch(
	() => import("playwright"),
)) as typeof import("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "test-results");
fs.mkdirSync(shots, { recursive: true });
if (!fs.existsSync(path.join(root, "dist/okmaps-elements.js"))) throw new Error("Build first: pnpm build");

const types: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
	const file = path.join(root, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
	if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
	fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;

const fail = (message: string): never => {
	throw new Error(message);
};

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const problems: string[] = [];
	page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
	page.on("console", (m) => {
		if (m.type() === "error") problems.push(`console: ${m.text()}`);
	});
	page.on("response", (r) => {
		if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
	});

	await page.goto(`http://localhost:${port}/example/index.html`);
	await page.waitForFunction(() => document.getElementById("log")?.textContent?.startsWith("Ready"));
	const ready = await page.textContent("#log");
	console.log(ready);

	// The map is drawn into the tag: areas on the map and papers in the list.
	const drawn = await page.evaluate(() => {
		const el = document.getElementById("map")!;
		return {
			children: el.children.length,
			svg: el.querySelectorAll("svg").length,
			okmaps: el.classList.contains("okmaps"),
		};
	});
	if (!drawn.children || !drawn.svg || !drawn.okmaps) fail(`map not drawn: ${JSON.stringify(drawn)}`);
	await page.screenshot({ path: path.join(shots, "elements-overview.png") });

	// Page controls drive it; okmaps-change reports it.
	await page.click("#biggest");
	await page.waitForFunction(() => /zoomedArea=(?!null)/.test(document.getElementById("log")?.textContent ?? ""));
	console.log(await page.textContent("#log"));
	await page.screenshot({ path: path.join(shots, "elements-zoomed.png") });
	await page.click("#overview");
	await page.waitForFunction(() => /zoomedArea=null/.test(document.getElementById("log")?.textContent ?? ""));
	await page.fill("#search", "zzzz-no-such-word");
	await page.waitForFunction(() => /listed=0/.test(document.getElementById("log")?.textContent ?? ""));

	// The core, used directly, made a list of its own.
	const areas = await page.locator("#areas li").count();
	if (areas < 2) fail(`processMap list has ${areas} areas`);

	// The tag is defined once and the bundle's exports are there.
	const api = await page.evaluate(async () => {
		const url = "/dist/okmaps-elements.js";
		const m = await import(url);
		return {
			defined: ["okmaps-map", "okmaps-search", "okmaps-settings", "okmaps-explorer"].every(
				(t) => !!customElements.get(t),
			),
			exports: ["createMap", "registerSource", "registerStoreType", "processMap", "defineElements"].every(
				(k) => typeof (m as Record<string, unknown>)[k] === "function",
			),
		};
	});
	if (!api.defined || !api.exports) fail(`bundle API: ${JSON.stringify(api)}`);

	if (problems.length) fail(`problems on the page:\n${problems.join("\n")}`);
	console.log("Elements browser test passed.");
} finally {
	await browser.close();
	server.close();
}
