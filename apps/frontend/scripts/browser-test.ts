// End-to-end check of the built app (VITE_GATEWAY_URL=https://gateway.test npm run build)
// in headless Chromium: makes a PubMed, a BASE and an OpenAIRE map from recorded
// provider answers, checks the map draws them, that they are listed
// and can be deleted, that a share link opens (and a crafted one runs no script),
// and that saved maps open offline. Screenshots go to test-results/.

import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGateway, memoryStore } from "@okmaps/gateway";
import type { Page, Route } from "playwright";
import { fakeAtomic, fakeWebdav } from "../../../packages/storage/test/fakes.ts";
import { fakeAnswer, GATEWAY } from "../test/fake-net.ts";
import { fakeSolidWorld, ISSUER } from "../test/fake-solid.ts";

// Playwright: the global copy (whose browser is installed) if there is one, else the project's.
const { chromium } = (await import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")).catch(
	() => import("playwright"),
)) as typeof import("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
const shots = path.resolve(here, "../test-results");
fs.mkdirSync(shots, { recursive: true });
const types: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
};

// APP_BASE: the path the site was built for (as on GitHub Pages); the server strips it.
const base = process.env.APP_BASE ?? "/";
const server = http.createServer((req, res) => {
	let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
	if (!p.startsWith(base)) {
		res.writeHead(404).end();
		return;
	}
	p = "/" + p.slice(base.length);
	const file = path.join(dist, p.endsWith("/") ? p + "index.html" : p);
	if (!file.startsWith(dist) || !fs.existsSync(file)) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
	fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
const home = `${origin}${base}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const unknown = new Set<string>();
// Share links go to a real gateway handler with an in-memory store.
const mapStore = memoryStore();
const gateway = createGateway({ baseApiKey: "k", allowedOrigins: ["*"], maps: { store: mapStore } });
// A WebDAV server at https://dav.test/dav/ (user "me", password "secret").
const dav = fakeWebdav("https://dav.test");
const davCors = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, content-type, depth",
	"access-control-allow-methods": "GET, PUT, DELETE, MKCOL, PROPFIND",
};
// An Atomic Data server at https://atomic.test, with one agent.
const atomicKey = crypto.getRandomValues(new Uint8Array(32));
const atomicAgent = { subject: "https://atomic.test/agents/me", privateKey: Buffer.from(atomicKey).toString("base64") };
const { ed25519 } = await import("@okmaps/storage");
const atomic = fakeAtomic("https://atomic.test", {
	subject: atomicAgent.subject,
	publicKey: (await ed25519(atomicAgent.privateKey)).publicKey,
});
const atomicCors = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "*",
	"access-control-allow-methods": "GET, POST, OPTIONS",
};
// A Solid identity provider (https://idp.test) and Pod (https://pod.test/me/).
const solid = await fakeSolidWorld();
async function answer(route: Route) {
	const url = route.request().url();
	if (url.startsWith("https://atomic.test/")) {
		const r = route.request();
		if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: atomicCors });
		const raw = r.postDataBuffer();
		// The fake reads uploads as FormData, as a server framework would hand them over.
		const body =
			raw && r.method() === "POST" && url.includes("/upload")
				? await new Request(url, { method: "POST", headers: r.headers(), body: new Uint8Array(raw) }).formData()
				: raw?.toString();
		const res = await atomic.fetch(url, { method: r.method(), headers: r.headers(), body });
		return route.fulfill({
			status: res.status,
			body: await res.text(),
			headers: { ...atomicCors, "content-type": res.headers.get("content-type") ?? "text/plain" },
		});
	}
	if (/^https:\/\/(idp|pod)\.test\//.test(url)) {
		const r = route.request();
		const res = await solid.answer(r.method(), url, r.headers(), r.postData() ?? undefined);
		return route.fulfill({ status: res.status, headers: res.headers, body: res.body ?? "" });
	}
	if (url.startsWith("https://dav.test/")) {
		const r = route.request();
		if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: davCors });
		const res = await dav.fetch(url, { method: r.method(), headers: r.headers(), body: r.postData() ?? undefined });
		return route.fulfill({
			status: res.status,
			body: await res.text(),
			headers: { ...davCors, "content-type": res.headers.get("content-type") ?? "text/plain" },
		});
	}
	if (url.startsWith(`${GATEWAY}/maps`)) {
		const r = route.request();
		const res = await gateway(
			new Request(url, {
				method: r.method(),
				headers: r.headers(),
				body: r.method() === "POST" ? r.postData() : undefined,
			}),
			{ address: "browser" },
		);
		await route.fulfill({ status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers) });
		return;
	}
	const answer = fakeAnswer(url);
	if (answer) {
		await route.fulfill({
			status: 200,
			body: answer.body,
			headers: { "content-type": answer.type, "access-control-allow-origin": "*" },
		});
	} else {
		unknown.add(new URL(url).hostname);
		await route.abort();
	}
}
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, answer);

async function openShared(p: Page, url: string, name: string) {
	await p.goto(url);
	await p.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });
	await p.waitForTimeout(1500);
	const areas = await p.$$eval("#visualization .okm-bubble", (c) => c.length);
	await p.screenshot({ path: path.join(shots, `${name}.png`) });
	console.log(JSON.stringify({ map: name, areas }));
}

async function makeMap(fill: () => Promise<void>, name: string) {
	await page.goto(home);
	await fill();
	const t0 = Date.now();
	await page.click("#submit");
	await page.waitForURL(/map\.html\?store=/, { timeout: 60_000 });
	const made = Date.now() - t0;
	await page.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });
	await page.waitForTimeout(1500);
	const counts = await page.evaluate(() => ({
		areas: document.querySelectorAll("#visualization .okm-bubble").length,
		papers: document.querySelectorAll("#visualization .okm-paper").length,
		listEntries: document.querySelectorAll("#visualization .okm-entry").length,
		title: document.querySelector(".okm-header h1")?.textContent?.trim().slice(0, 120) ?? "",
	}));
	await page.screenshot({ path: path.join(shots, `${name}.png`) });
	console.log(JSON.stringify({ map: name, msToMap: made, ...counts }));
	if (counts.areas === 0) throw new Error(`${name}: no areas drawn`);
	return counts;
}

/** Shares the open map with its Share button and returns its link. */
async function shareLink(p: Page) {
	await p.click(".okm-header button:text-is('Share')");
	const input = p.getByLabel("Link to this map");
	await input.waitFor();
	const url = await input.inputValue();
	await p.keyboard.press("Escape");
	return url;
}

/** The maps in the explorer (the default store's top folder, open on wide screens). */
const MAP = ".okm-explorer .map";
const listedMaps = (p: Page) => p.$$eval(`${MAP} .title`, (t) => t.map((x) => x.textContent));
/** Deletes the first (newest) listed map, confirming it. */
async function deleteFirstMap(p: Page) {
	const before = await p.$$eval(MAP, (l) => l.length);
	await p
		.locator(MAP)
		.first()
		.getByRole("button", { name: /^Delete map/ })
		.click();
	await p.locator(".okm-explorer [role=alert] button:text-is('Delete')").click();
	await p.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length === n, [MAP, before - 1] as const);
}

/** Checks the open map: no markup from its data, every paper listed, and zooming in. */
async function checkMap(p: Page, name: string) {
	const drawn = await p.evaluate(() => ({
		areas: document.querySelectorAll("#visualization .okm-bubble").length,
		papers: document.querySelectorAll("#visualization .okm-paper").length,
		// The credit's logo is ours; any other image came from the map's data.
		images: document.querySelectorAll("#visualization img:not(.okm-credit img)").length,
		listEntries: document.querySelectorAll("#visualization .okm-entry").length,
	}));
	console.log(JSON.stringify({ map: name, ...drawn }));
	if (drawn.images) throw new Error(`${name}: rendered markup from the map`);
	if (drawn.listEntries !== drawn.papers)
		throw new Error(`${name}: lists ${drawn.listEntries} of ${drawn.papers} papers`);
	await p.click("#visualization .okm-bubble", { force: true }); // its papers may sit on top: both zoom in
	await p.waitForSelector("#visualization svg.okm-knowledge-map.zoom");
	const zoomedPapers = await p.$$eval("#visualization .okm-paper", (g) => g.length);
	const zoomedEntries = await p.$$eval("#visualization .okm-entry", (e) => e.length);
	if (zoomedEntries !== zoomedPapers)
		throw new Error(`${name}: zoomed list shows ${zoomedEntries} of ${zoomedPapers} papers`);
}

await makeMap(async () => {
	await page.check('input[value="pubmed"]');
	await page.fill("#q", "ecology");
}, "pubmed");
await makeMap(async () => {
	await page.check('input[value="base"]');
	await page.fill("#q", "digital education");
}, "base");
// A streamgraph, made and then opened from a share link (the gateway keeps
// no streams, so the map page counts the keywords again).
{
	await page.goto(home);
	await page.check('input[value="base"]');
	await page.selectOption("#vis_type", "timeline");
	await page.fill("#q", "digital education");
	await page.click("#submit");
	await page.waitForURL(/map\.html\?store=/, { timeout: 60_000 });
	const streams = async (p: Page) => {
		await p.waitForSelector("#visualization .okm-streamgraph .stream", { timeout: 30_000 });
		return p.$$eval("#visualization .okm-streamgraph .stream", (s) => s.length);
	};
	const made = await streams(page);
	await page.screenshot({ path: path.join(shots, "streamgraph.png") });
	const sharedSg = await shareLink(page);
	const viewer = await browser.newPage({ viewport: { width: 1280, height: 860 } });
	viewer.on("pageerror", (e) => errors.push(e.message));
	await viewer.route(/^https?:\/\/(?!127\.0\.0\.1)/, answer);
	await viewer.goto(sharedSg);
	const shared = await streams(viewer);
	await viewer.close();
	console.log(JSON.stringify({ map: "streamgraph", streams: made, sharedStreams: shared }));
	if (made === 0 || shared !== made) throw new Error("streamgraph: streams missing");
	// On a phone, a picked stream's name keeps the list header's width; the
	// "show all" button goes above it instead of squeezing it.
	for (const colorScheme of ["light", "dark"] as const) {
		const phone = await browser.newPage({ viewport: { width: 360, height: 760 }, colorScheme });
		phone.on("pageerror", (e) => errors.push(e.message));
		await phone.route(/^https?:\/\/(?!127\.0\.0\.1)/, answer);
		await phone.goto(sharedSg);
		await streams(phone);
		await phone.focus("#visualization .okm-streamgraph .stream");
		await phone.keyboard.press("Enter");
		if (!(await phone.$("#visualization .drawer"))) await phone.click("#visualization .open-list");
		await phone.waitForSelector("#visualization .drawer .okm-list .header .okm-button");
		await phone.waitForTimeout(300); // the drawer slides in
		const header = await phone.$eval("#visualization .drawer .okm-list .header", (h) => {
			const box = (sel: string) => h.querySelector(sel)!.getBoundingClientRect();
			return {
				width: h.clientWidth,
				heading: box(".heading").width,
				back: box(".okm-button").bottom,
				title: box(".toggle").top,
			};
		});
		// The page title, too, keeps its width; the Cite/Share/Embed buttons go above it.
		const pageTitle = await phone.$eval(".okm-header", (h) => ({
			title: h.querySelector(".title")!.getBoundingClientRect().top,
			buttons: h.querySelector(".actions")!.getBoundingClientRect().bottom,
		}));
		await phone.screenshot({ path: path.join(shots, `streamgraph-phone-${colorScheme}.png`) });
		await phone.close();
		console.log(JSON.stringify({ streamgraphPhone: { colorScheme, ...header, pageTitle } }));
		if (pageTitle.buttons > pageTitle.title + 1) throw new Error("streamgraph: page title squashed on a phone");
		if (header.heading < 60 || header.back > header.title + 1)
			throw new Error("streamgraph: stream title squashed on a phone");
	}
	// Delete it again (it is the newest), so the counts below stay as they were.
	await page.goto(home);
	await page.waitForSelector(MAP);
	await deleteFirstMap(page);
}
// A geo map of the bundled AQUANAVI facility table, also opened from its share link.
{
	await page.goto(home);
	await page.check('input[value="place:aquanavi"]');
	await page.click("#submit");
	await page.waitForURL(/map\.html\?store=/, { timeout: 60_000 });
	const pins = async (p: Page) => {
		await p.waitForSelector("#visualization .okm-geomap .leaflet-marker-icon", { timeout: 30_000 });
		return p.$$eval("#visualization .leaflet-marker-icon", (m) => m.length);
	};
	const made = await pins(page);
	const title = await page.$eval(".okm-header h1", (h) => h.textContent.trim());
	await page.screenshot({ path: path.join(shots, "geomap.png") });
	const sharedGeo = await shareLink(page);
	const viewer = await browser.newPage({ viewport: { width: 1280, height: 860 } });
	viewer.on("pageerror", (e) => errors.push(e.message));
	await viewer.route(/^https?:\/\/(?!127\.0\.0\.1)/, answer);
	await viewer.goto(sharedGeo);
	const shared = await pins(viewer);
	await viewer.close();
	console.log(JSON.stringify({ map: "geomap", title, pins: made, sharedPins: shared }));
	// 98 facilities; pins at the same spot may be clustered, but some must show.
	if (made === 0 || shared !== made) throw new Error("geomap: pins missing");
	await page.goto(home);
	await page.waitForSelector(MAP);
	await deleteFirstMap(page);
}
await makeMap(async () => {
	await page.check('input[value="openaire"]');
	await page.fill("#project_id", "643410");
}, "openaire");
await checkMap(page, "openaire");

// Share the open (OpenAIRE) map, then open the link as someone else would.
const link = await shareLink(page);
console.log(JSON.stringify({ link }));
if (!/map\.html\?shared=[0-9a-f]{24}$/.test(link)) throw new Error("no share link");
const other = await browser.newPage({ viewport: { width: 1280, height: 860 } });
other.on("pageerror", (e) => errors.push(e.message));
await other.route(/^https?:\/\/(?!127\.0\.0\.1)/, answer);
await openShared(other, link, "shared");
await other.click(".okm-settings .fab"); // the page's links are in the settings panel
await other.click("#save");
await other.waitForSelector('#save:text-matches("Saved to")');
await other.goto(home);
await other.waitForSelector(MAP);
const savedCopy = await listedMaps(other);
console.log(JSON.stringify({ savedFromLink: savedCopy }));
if (savedCopy.length !== 1) throw new Error("the shared map was not saved");
await other.click(`${MAP} a`);
await other.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });

// A crafted map must not run script, however its titles are encoded.
const evil = "&lt;img src=x onerror=&quot;window.pwned=1&quot;&gt;";
const crafted = JSON.stringify({
	title: evil,
	context: { id: "x", query: evil, service: "pubmed", timestamp: "2026-11-06 10:00:00", params: "{}" },
	documents: ["A", "B"].map((a, i) => ({
		id: `d${i}`,
		area: `${evil}${a}`,
		area_uri: i,
		title: evil,
		authors: evil,
		paper_abstract: evil,
		x: String(i),
		y: String(-i),
		year: "2020",
		published_in: evil,
		readers: 0,
		url: "",
		oa_state: 2,
		subject_orig: "",
		relevance: 1,
		resulttype: [],
	})),
});
const posted = await gateway(
	new Request(`${GATEWAY}/maps`, { method: "POST", headers: { "content-type": "application/json" }, body: crafted }),
);
const evilId = (await posted.json()).id;
await openShared(other, link.replace(/shared=.*/, `shared=${evilId}`), "shared-crafted");
if (await other.evaluate(() => (window as { pwned?: boolean }).pwned)) throw new Error("a shared map ran script");
await checkMap(other, "shared-crafted");
if (await other.evaluate(() => (window as { pwned?: boolean }).pwned)) throw new Error("a shared map ran script");
console.log(JSON.stringify({ craftedMapSafe: true }));
await other.close();

await page.goto(home);
await page.waitForSelector(MAP);
const listed = await listedMaps(page);
console.log(JSON.stringify({ listed }));
if (listed.length !== 3) throw new Error("expected 3 saved maps");
await page.screenshot({ path: path.join(shots, "home.png") });
await deleteFirstMap(page);

// More places to keep maps, added on the settings page. Each kind is checked
// before it is added; a new map then goes to whichever is the default.
async function addStore(type: string, fill: () => Promise<void>) {
	await page.goto(`${home}settings.html`);
	await page.click("button:text-is('Add a place to keep maps')");
	await page.check(`input[name="type"][value="${type}"]`);
	await fill();
	await page.click("button:text-is('Check and save')");
	await page.waitForFunction(
		() => /was added|could not be used/.test(document.querySelector("#settings")?.textContent ?? ""),
		null,
		{ timeout: 30_000 },
	);
	return page.$eval(
		"#settings",
		(e) => e.textContent!.match(/([^\n]{0,40}? was added|That store could not be used[^.]*)/)![0],
	);
}
/** Makes the named store the default (on the settings page). */
async function makeDefault(name: string) {
	await page.goto(`${home}settings.html`);
	await page.locator(".stores li", { hasText: name }).getByRole("button", { name: "Make default" }).click();
}
/** Makes an OpenAIRE map, which goes to the default store; returns the map's URL. */
async function mapInDefault() {
	await page.goto(home);
	await page.waitForSelector("body[data-maps]", { timeout: 30_000 });
	await page.check('input[value="openaire"]');
	await page.fill("#project_id", "643410");
	await page.click("#submit");
	await page.waitForURL(/map\.html\?store=/, { timeout: 60_000 });
	await page.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });
	return page.url();
}
const storeId = (name: string) =>
	page.evaluate(
		(n) =>
			JSON.parse(localStorage.getItem("okmaps-settings")!).stores.find(
				(s: { name: string; id: string }) => s.name === n,
			).id,
		name,
	);

const wrongPassword = await addStore("webdav", async () => {
	await page.fill("#okm-store-name", "My cloud");
	await page.fill("#okm-store-url", "https://dav.test/dav/okmaps/");
	await page.fill("#okm-store-username", "me");
	await page.fill("#okm-store-password", "wrong");
});
console.log(JSON.stringify({ wrongPassword }));
if (!/could not be used/.test(wrongPassword)) throw new Error("a refused WebDAV login was not reported");
await page.fill("#okm-store-password", "secret");
await page.click("button:text-is('Check and save')");
await page.waitForSelector(".okm-settings-page :text('My cloud was added.')");
await makeDefault("My cloud");
const davMap = await mapInDefault();
await page.goto(home);
await page.waitForSelector(MAP);
const onDav = await listedMaps(page);
const davFiles = [...dav.tree.keys()].filter((k) => k.startsWith("/dav/okmaps/"));
console.log(
	JSON.stringify({
		listedFromWebdav: onDav,
		open: await page.textContent(".okm-explorer h3 [aria-expanded=true]"),
		davFiles: davFiles.length,
	}),
);
if (
	onDav.length !== 1 ||
	!davFiles.includes("/dav/okmaps/index.json") ||
	!davMap.includes(`store=${await storeId("My cloud")}`)
)
	throw new Error("the map was not kept in the WebDAV folder");
await page.screenshot({ path: path.join(shots, "settings-home.png") });
await page.goto(`${home}settings.html`);
await page.screenshot({ path: path.join(shots, "settings.png") });

// A Solid Pod: log in at the identity provider and come back to the settings
// page, which adds okmaps/ at the top of the Pod the WebID names.
const solidStatus = await addStore("solid", async () => {
	await page.fill("#okm-store-name", "My Pod");
	await page.fill("#okm-store-issuer", ISSUER);
});
console.log(JSON.stringify({ solid: solidStatus, idp: solid.log }));
if (!/Pod was added/.test(solidStatus)) throw new Error("the Pod was not added after logging in");
await makeDefault("My Pod");
const podMapUrl = await mapInDefault();
const podFiles = [...solid.pod.tree.keys()].filter((k) => k.startsWith("/me/okmaps/maps/") && k.endsWith(".json"));
if (podFiles.length !== 1) throw new Error(`the map was not kept in the Pod: ${JSON.stringify(podFiles)}`);
// The map page reads Pod maps from a copy in this browser. Without that copy
// (a bookmark, say), the main page logs in again silently, fetches the map
// and comes back.
const podCopy = `okmaps-pod-copy-${await storeId("My Pod")}`;
await page.goto(home);
// After the start page's own silent login, so nothing navigates while the copy is deleted.
await page.waitForSelector(`body[data-maps] ${MAP}`, { timeout: 30_000 });
await page.evaluate(
	(name) =>
		new Promise((r) => {
			const q = indexedDB.deleteDatabase(name);
			q.onsuccess = q.onerror = q.onblocked = r;
		}),
	podCopy,
);
const authsBefore = solid.log.filter((l) => l === "GET /auth").length;
await page.goto(podMapUrl);
await page.waitForURL((u) => u.href === podMapUrl, { timeout: 30_000 });
await page.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });
console.log(
	JSON.stringify({
		podMapWithoutCopy: page.url() === podMapUrl,
		silentLogins: solid.log.filter((l) => l === "GET /auth").length - authsBefore,
	}),
);
// Sharing saves the published id with the map; the map page cannot write to
// the Pod, so the main page sends it there next time.
await shareLink(page);
const podMapId = new URL(podMapUrl).searchParams.get("id");
await page.goto(home);
await page.waitForSelector(MAP);
await page.waitForFunction(
	async (name) =>
		!(await new Promise((r) => {
			const q = indexedDB.open(name);
			q.onsuccess = () => {
				const g = q.result.transaction("docs").objectStore("docs").get("unsent.json");
				g.onsuccess = () => {
					q.result.close();
					r(g.result);
				};
			};
		})),
	podCopy,
);
if (!JSON.parse(solid.pod.tree.get(`/me/okmaps/maps/${podMapId}.json`)!).sharedId)
	throw new Error("the map page's change did not reach the Pod");
console.log(
	JSON.stringify({
		listedFromPod: await listedMaps(page),
		open: await page.textContent(".okm-explorer h3 [aria-expanded=true]"),
	}),
);

// An Atomic Data server: requests and commits signed with the agent's key.
const atomicStatus = await addStore("atomic", async () => {
	await page.fill("#okm-store-parent", "https://atomic.test/drive/okmaps");
	await page.fill("#okm-store-secret", Buffer.from(JSON.stringify(atomicAgent)).toString("base64"));
});
console.log(JSON.stringify({ atomic: atomicStatus }));
if (!/was added/.test(atomicStatus)) throw new Error("the Atomic Data server was not added");
await makeDefault("atomic.test");
await mapInDefault();
await page.goto(home);
await page.waitForSelector(MAP);
const onAtomic = await listedMaps(page);
if (onAtomic.length !== 1) throw new Error(`the map was not kept on Atomic Data: ${JSON.stringify(onAtomic)}`);
console.log(JSON.stringify({ listedFromAtomic: onAtomic, atomicFiles: atomic.resources.size }));
await makeDefault("This browser");
await page.goto(home);
await page.waitForSelector(MAP);

// The explorer: a folder, a map dragged into it, then moved to another store.
{
	await page.click(".okm-explorer button:text-is('+ New folder')");
	await page.fill(".okm-explorer input[placeholder='Folder name']", "Reading");
	await page.click(".okm-explorer button:text-is('Make')");
	const folder = page.locator(".okm-explorer .folder .row", { hasText: "Reading" });
	await folder.waitFor();
	await page.locator(MAP, { hasText: "ecology" }).locator("a").dragTo(folder);
	await page.waitForFunction(() =>
		/ecology moved to This browser \/ Reading/.test(
			document.querySelector(".okm-explorer [role=status]")!.textContent!,
		),
	);
	await folder.getByRole("button", { name: "Reading", exact: true }).click();
	await page.locator(".okm-explorer .nested .map", { hasText: "ecology" }).waitFor();
	await page.screenshot({ path: path.join(shots, "explorer.png") });
	await page
		.locator(".okm-explorer .nested .map", { hasText: "ecology" })
		.getByRole("button", { name: /^Move map/ })
		.click();
	await page.getByRole("radio", { name: "My cloud" }).check();
	await page.click("dialog button:text-is('Move')");
	await page.waitForFunction(() =>
		/ecology moved to My cloud/.test(document.querySelector(".okm-explorer [role=status]")!.textContent!),
	);
	const davTitles = [...dav.tree.entries()]
		.filter(([k]) => /^\/dav\/okmaps\/maps\/.*\.json$/.test(k))
		.map(([, v]) => JSON.parse(v as string).title);
	console.log(JSON.stringify({ explorer: { top: await listedMaps(page), onDav: davTitles } }));
	if (!davTitles.includes("ecology")) throw new Error("the map was not moved to the WebDAV store");
}
// A map made without saving it opens as a draft, and is saved from the map page.
{
	await page.goto(home);
	await page.waitForSelector("body[data-maps]");
	await page.check('input[value="openaire"]');
	await page.fill("#project_id", "643410");
	await page.selectOption("#save_to", "none");
	await page.click("#submit");
	await page.waitForURL(/map\.html\?draft=/, { timeout: 60_000 });
	await page.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });
	await page.click(".okm-settings .fab");
	await page.selectOption("#save-to", { label: "My cloud" });
	await page.click("#save");
	await page.waitForURL(/map\.html\?store=/);
	const saved = await page.textContent("#save");
	const davMaps = [...dav.tree.keys()].filter((k) => /^\/dav\/okmaps\/maps\/.*\.json$/.test(k)).length;
	console.log(JSON.stringify({ draft: { saved, davMaps } }));
	if (davMaps !== 3 || !/Saved to My cloud/.test(saved ?? "")) throw new Error("the draft was not saved");
	await page.reload();
	await page.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });
	// The form remembers "don't save"; choose this browser again.
	await page.goto(home);
	await page.selectOption("#save_to", { label: "This browser" });
}
await page.setViewportSize({ width: 412, height: 860 });
await page.goto(home);
await page.waitForSelector("body[data-maps]");
await page.screenshot({ path: path.join(shots, "home-phone.png") });
await page.click("button:text-is('Your maps')");
await page.waitForSelector(MAP);
await page.waitForTimeout(500); // the drawer slides in
await page.screenshot({ path: path.join(shots, "explorer-phone.png") });
await page.setViewportSize({ width: 1280, height: 860 });

// A failing search shows the reason, not a crash.
await page.check('input[value="openaire"]');
await page.fill("#project_id", "000");
await page.route("https://api.openaire.eu/search/projects**", (r) =>
	r.fulfill({ status: 200, body: "<response><results/></response>" }),
);
await page.click("#submit");
await page.waitForSelector(".status.error");
console.log(JSON.stringify({ error: await page.textContent("#status") }));

// Offline: once the service worker has stored the app, saved maps open without a network.
await page.goto(home);
await page.waitForSelector("body[data-maps]", { timeout: 30_000 });
const cached = await page.evaluate(async () => {
	await navigator.serviceWorker.ready;
	const keys = await caches.keys();
	return {
		controlled: !!navigator.serviceWorker.controller,
		caches: keys,
		files: (await (await caches.open(keys[0])).keys()).length,
	};
});
console.log(JSON.stringify({ serviceWorker: cached }));
await page.context().setOffline(true);
await page.reload();
await page.waitForSelector(MAP);
await page.click(`${MAP} a`);
await page.waitForSelector("#visualization .okm-bubble", { timeout: 30_000 });
const offlineAreas = await page.$$eval("#visualization .okm-bubble", (c) => c.length);
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
