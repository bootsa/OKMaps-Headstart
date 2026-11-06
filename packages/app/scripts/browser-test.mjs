// End-to-end check of the built app (npm run build:vis && VITE_GATEWAY_URL=https://gateway.test npm run build)
// in headless Chromium: makes a PubMed, a BASE and an OpenAIRE map from recorded
// provider answers, checks the visualisation draws them, that they are listed
// and can be deleted, that a share link opens (and a crafted one runs no script),
// and that saved maps open offline. Screenshots go to test-results/.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fakeAnswer, GATEWAY } from "../test/fake-net.ts";
import { createGateway, memoryStore } from "../../gateway/src/index.ts";
import { fakeWebdav } from "../../storage/test/fakes.ts";

// Playwright: the global copy (whose browser is installed) if there is one, else the project's.
const { chromium } = await import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")).catch(
  () => import("playwright"),
);

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
const shots = path.resolve(here, "../test-results");
fs.mkdirSync(shots, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };

// APP_BASE: the path the site was built for (as on GitHub Pages); the server strips it.
const base = process.env.APP_BASE ?? "/";
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!p.startsWith(base)) {
    res.writeHead(404).end();
    return;
  }
  p = "/" + p.slice(base.length);
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
const home = `${origin}${base}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const unknown = new Set();
// Share links go to a real gateway handler with an in-memory store.
const mapStore = memoryStore();
const gateway = createGateway({ baseApiKey: "k", allowedOrigins: ["*"], maps: { store: mapStore } });
// A WebDAV server at https://dav.test/dav/ (user "me", password "secret").
const dav = fakeWebdav("https://dav.test");
const davCors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, depth", "access-control-allow-methods": "GET, PUT, DELETE, MKCOL, PROPFIND" };
async function answer(route) {
  const url = route.request().url();
  if (url.startsWith("https://dav.test/")) {
    const r = route.request();
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: davCors });
    const res = await dav.fetch(url, { method: r.method(), headers: r.headers(), body: r.postData() ?? undefined });
    return route.fulfill({ status: res.status, body: await res.text(), headers: { ...davCors, "content-type": res.headers.get("content-type") ?? "text/plain" } });
  }
  if (url.startsWith(`${GATEWAY}/maps`)) {
    const r = route.request();
    const res = await gateway(
      new Request(url, { method: r.method(), headers: r.headers(), body: r.method() === "POST" ? r.postData() : undefined }),
      { address: "browser" },
    );
    await route.fulfill({ status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers) });
    return;
  }
  const answer = fakeAnswer(url);
  if (answer) {
    await route.fulfill({ status: 200, body: answer.body, headers: { "content-type": answer.type, "access-control-allow-origin": "*" } });
  } else {
    unknown.add(new URL(url).hostname);
    await route.abort();
  }
}
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, answer);

async function openShared(p, url, name) {
  await p.goto(url);
  await p.waitForSelector("#visualization circle.area", { timeout: 30_000 });
  await p.waitForTimeout(1500);
  const areas = await p.$$eval("#visualization circle.area", (c) => c.length);
  await p.screenshot({ path: path.join(shots, `${name}.png`) });
  console.log(JSON.stringify({ map: name, areas }));
}

async function makeMap(fill, name) {
  await page.goto(home);
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

// Share the open (OpenAIRE) map, then open the link as someone else would.
await page.click("#share");
await page.waitForSelector("#share-panel:not([hidden])");
const link = await page.inputValue("#share-url");
console.log(JSON.stringify({ link }));
if (!/map\.html\?shared=[0-9a-f]{24}$/.test(link)) throw new Error("no share link");
const other = await browser.newPage({ viewport: { width: 1280, height: 860 } });
other.on("pageerror", (e) => errors.push(e.message));
await other.route(/^https?:\/\/(?!127\.0\.0\.1)/, answer);
await openShared(other, link, "shared");
await other.click("#save");
await other.waitForSelector("#save:disabled");
await other.goto(home);
await other.waitForSelector("#maps li");
const savedCopy = await other.$$eval("#maps li a", (as) => as.map((a) => a.textContent));
console.log(JSON.stringify({ savedFromLink: savedCopy }));
if (savedCopy.length !== 1) throw new Error("the shared map was not saved");
await other.click("#maps li a");
await other.waitForSelector("#visualization circle.area", { timeout: 30_000 });

// A crafted map must not run script, however its titles are encoded.
const evil = "&lt;img src=x onerror=&quot;window.pwned=1&quot;&gt;";
const crafted = JSON.stringify({
  title: evil,
  context: { id: "x", query: evil, service: "pubmed", timestamp: "2026-11-06 10:00:00", params: "{}" },
  documents: ["A", "B"].map((a, i) => ({
    id: `d${i}`, area: `${evil}${a}`, area_uri: i, title: evil, authors: evil, paper_abstract: evil, x: String(i), y: String(-i),
    year: "2020", published_in: evil, readers: 0, url: "", oa_state: 2, subject_orig: "", relevance: 1, resulttype: [],
  })),
});
const posted = await gateway(new Request(`${GATEWAY}/maps`, { method: "POST", headers: { "content-type": "application/json" }, body: crafted }));
const evilId = (await posted.json()).id;
await openShared(other, link.replace(/shared=.*/, `shared=${evilId}`), "shared-crafted");
if (await other.evaluate(() => window.pwned)) throw new Error("a shared map ran script");
console.log(JSON.stringify({ craftedMapSafe: true }));
await other.close();

await page.goto(home);
await page.waitForSelector("#maps li");
const listed = await page.$$eval("#maps li a", (as) => as.map((a) => a.textContent));
console.log(JSON.stringify({ listed }));
if (listed.length !== 3) throw new Error("expected 3 saved maps");
await page.screenshot({ path: path.join(shots, "home.png") });
await page.click("#maps li .delete");
await page.waitForFunction(() => document.querySelectorAll("#maps li").length === 2);

// Keep the maps in a WebDAV folder instead, copying the ones made so far.
async function useStorage(fill) {
  await page.click("#storage-settings summary");
  await fill();
  await page.click("#storage-save");
  await page.waitForFunction(() => /now kept|could not/.test(document.querySelector("#storage-status").textContent));
  return page.textContent("#storage-status");
}
const wrongPassword = await useStorage(async () => {
  await page.check('#storage input[value="webdav"]');
  await page.fill("#dav-url", "https://dav.test/dav/okmaps/");
  await page.fill("#dav-user", "me");
  await page.fill("#dav-password", "wrong");
});
console.log(JSON.stringify({ wrongPassword }));
if (!/could not be used/.test(wrongPassword)) throw new Error("a refused WebDAV login was not reported");
await page.fill("#dav-password", "secret");
await page.click("#storage-save");
await page.waitForFunction(() => /now kept/.test(document.querySelector("#storage-status").textContent));
console.log(JSON.stringify({ webdav: await page.textContent("#storage-status") }));
await page.reload();
await page.waitForSelector("#maps li");
const onDav = await page.$$eval("#maps li a", (as) => as.map((a) => a.textContent));
const davFiles = [...dav.tree.keys()].filter((k) => k.startsWith("/dav/okmaps/"));
console.log(JSON.stringify({ listedFromWebdav: onDav, label: await page.textContent("#storage-label"), davFiles: davFiles.length }));
if (JSON.stringify(onDav) !== JSON.stringify(listed.slice(1)) || !davFiles.includes("/dav/okmaps/index.json")) throw new Error("maps were not moved to WebDAV");
await page.click("#maps li a");
await page.waitForSelector("#visualization circle.area", { timeout: 30_000 });
await page.goto(home);
// Back to this browser (nothing to copy: the maps are there already).
await useStorage(async () => {
  await page.check('#storage input[value="browser"]');
});
await page.waitForSelector("#maps li");

// A failing search shows the reason, not a crash.
await page.check('input[value="openaire"]');
await page.fill("#project_id", "000");
await page.route("https://api.openaire.eu/search/projects**", (r) => r.fulfill({ status: 200, body: "<response><results/></response>" }));
await page.click("#submit");
await page.waitForSelector(".status.error");
console.log(JSON.stringify({ error: await page.textContent("#status") }));

// Offline: once the service worker has stored the app, saved maps open without a network.
await page.goto(home);
const cached = await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  return { controlled: !!navigator.serviceWorker.controller, caches: keys, files: (await (await caches.open(keys[0])).keys()).length };
});
console.log(JSON.stringify({ serviceWorker: cached }));
await page.context().setOffline(true);
await page.reload();
await page.waitForSelector("#maps li");
await page.click("#maps li a");
await page.waitForSelector("#visualization circle.area", { timeout: 30_000 });
const offlineAreas = await page.$$eval("#visualization circle.area", (c) => c.length);
await page.screenshot({ path: path.join(shots, "offline.png") });
console.log(JSON.stringify({ offlineMap: { areas: offlineAreas } }));
await page.context().setOffline(false);

await browser.close();
server.close();
if (unknown.size) console.log(JSON.stringify({ blockedHosts: [...unknown] }));
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
