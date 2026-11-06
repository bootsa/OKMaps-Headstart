// End-to-end check of the built app (npm run build:vis && VITE_GATEWAY_URL=https://gateway.test npm run build)
// in headless Chromium: makes a PubMed, a BASE and an OpenAIRE map from recorded
// provider answers, checks the visualisation draws them, that they are listed
// and can be deleted. Screenshots go to test-results/.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fakeAnswer } from "../test/fake-net.ts";

// Playwright: the global copy (whose browser is installed) if there is one, else the project's.
const { chromium } = await import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")).catch(
  () => import("playwright"),
);

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
const shots = path.resolve(here, "../test-results");
fs.mkdirSync(shots, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(dist, p.endsWith("/") ? p + "index.html" : p);
  if (!file.startsWith(dist) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const unknown = new Set();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
  const url = route.request().url();
  const answer = fakeAnswer(url);
  if (answer) {
    await route.fulfill({ status: 200, body: answer.body, headers: { "content-type": answer.type, "access-control-allow-origin": "*" } });
  } else {
    unknown.add(new URL(url).hostname);
    await route.abort();
  }
});

async function makeMap(fill, name) {
  await page.goto(`${origin}/`);
  await fill();
  const t0 = Date.now();
  await page.click("#submit");
  await page.waitForURL(/map\.html\?id=/, { timeout: 60_000 });
  const made = Date.now() - t0;
  await page.waitForSelector("#visualization circle.area", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const counts = await page.evaluate(() => ({
    areas: document.querySelectorAll("#visualization circle.area").length,
    papers: document.querySelectorAll("#visualization g.paper").length,
    listEntries: document.querySelectorAll(".list_entry").length,
    title: document.querySelector("#context, #subdiscipline_title, h4")?.textContent?.trim().slice(0, 120) ?? "",
  }));
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
  console.log(JSON.stringify({ map: name, msToMap: made, ...counts }));
  if (counts.areas === 0) throw new Error(`${name}: no areas drawn`);
}

await makeMap(async () => {
  await page.check('input[value="pubmed"]');
  await page.fill("#q", "ecology");
}, "pubmed");
await makeMap(async () => {
  await page.check('input[value="base"]');
  await page.fill("#q", "digital education");
}, "base");
await makeMap(async () => {
  await page.check('input[value="openaire"]');
  await page.fill("#project_id", "643410");
}, "openaire");

await page.goto(`${origin}/`);
await page.waitForSelector("#maps li");
const listed = await page.$$eval("#maps li a", (as) => as.map((a) => a.textContent));
console.log(JSON.stringify({ listed }));
if (listed.length !== 3) throw new Error("expected 3 saved maps");
await page.screenshot({ path: path.join(shots, "home.png") });
await page.click("#maps li .delete");
await page.waitForFunction(() => document.querySelectorAll("#maps li").length === 2);

// A failing search shows the reason, not a crash.
await page.check('input[value="openaire"]');
await page.fill("#project_id", "000");
await page.route("https://api.openaire.eu/search/projects**", (r) => r.fulfill({ status: 200, body: "<response><results/></response>" }));
await page.click("#submit");
await page.waitForSelector(".status.error");
console.log(JSON.stringify({ error: await page.textContent("#status") }));

await browser.close();
server.close();
if (unknown.size) console.log(JSON.stringify({ blockedHosts: [...unknown] }));
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
