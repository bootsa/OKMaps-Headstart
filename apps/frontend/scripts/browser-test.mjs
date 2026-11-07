// End-to-end check of the built app (npm run build:vis && VITE_GATEWAY_URL=https://gateway.test npm run build)
// in headless Chromium: makes a PubMed, a BASE and an OpenAIRE map from recorded
// provider answers, checks the visualisation draws them, that they are listed
// and can be deleted, that a share link opens (and a crafted one runs no script),
// and that saved maps open offline. Screenshots go to test-results/.

import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGateway, memoryStore } from "@okmaps/gateway";
import { fakeAtomic, fakeWebdav } from "../../../packages/storage/test/fakes.ts";
import { fakeAnswer, GATEWAY } from "../test/fake-net.ts";
import { fakeSolidWorld, ISSUER } from "../test/fake-solid.ts";

// Playwright: the global copy (whose browser is installed) if there is one, else the project's.
const { chromium } = await import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")).catch(
	() => import("playwright"),
);

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
const shots = path.resolve(here, "../test-results");
fs.mkdirSync(shots, { recursive: true });
const types = {
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
	let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
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
async function answer(route) {
	const url = route.request().url();
	if (url.startsWith("https://atomic.test/")) {
		const r = route.request();
		if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: atomicCors });
		const raw = r.postDataBuffer();
		// The fake reads uploads as FormData, as a server framework would hand them over.
		const body =
			raw && r.method() === "POST" && url.includes("/upload")
				? await new Request(url, { method: "POST", headers: r.headers(), body: raw }).formData()
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
	return counts;
}

/**
 * Shares the open map and returns its link (without ui=new). The current
 * look has a Share button in the toolbar; the new look has one by the title.
 */
async function shareLink(p) {
	if (await p.isVisible("#share")) {
		await p.click("#share");
		await p.waitForSelector("#share-panel:not([hidden])");
		return p.inputValue("#share-url");
	}
	await p.click(".okm-header button:text-is('Share')");
	const input = p.getByLabel("Link to this map");
	await input.waitFor();
	const url = new URL(await input.inputValue());
	if (url.searchParams.get("ui") !== "new") throw new Error("the new look's share link drops ui=new");
	await p.keyboard.press("Escape");
	url.searchParams.delete("ui");
	return url.href;
}

/** Opens the current map in the new (Svelte) interface and checks it draws the same areas. */
async function checkNewLook(p, name, areas) {
	const toggle = await p.getAttribute("#ui-toggle", "href");
	if (!toggle?.includes("ui=new")) throw new Error(`${name}: no link to the new look`);
	await p.goto(toggle);
	await p.waitForSelector("#visualization svg.okm-knowledge-map .okm-bubble", { timeout: 30_000 });
	await p.waitForTimeout(500);
	const drawn = await p.evaluate(() => ({
		areas: document.querySelectorAll("#visualization .okm-bubble").length,
		papers: document.querySelectorAll("#visualization .okm-paper").length,
		images: document.querySelectorAll("#visualization img").length,
		listEntries: document.querySelectorAll("#visualization .okm-entry").length,
	}));
	await p.screenshot({ path: path.join(shots, `${name}-new.png`) });
	console.log(JSON.stringify({ map: `${name} (new look)`, ...drawn }));
	if (areas !== undefined && drawn.areas !== areas)
		throw new Error(`${name}: new look drew ${drawn.areas} areas, not ${areas}`);
	if (drawn.images) throw new Error(`${name}: new look rendered markup from the map`);
	if (drawn.listEntries !== drawn.papers)
		throw new Error(`${name}: new look lists ${drawn.listEntries} of ${drawn.papers} papers`);
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
const openaire = await makeMap(async () => {
	await page.check('input[value="openaire"]');
	await page.fill("#project_id", "643410");
}, "openaire");
await checkNewLook(page, "openaire", openaire.areas);

// Share the open (OpenAIRE) map, then open the link as someone else would.
const link = await shareLink(page);
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
if (await other.evaluate(() => window.pwned)) throw new Error("a shared map ran script");
await checkNewLook(other, "shared-crafted");
if (await other.evaluate(() => window.pwned)) throw new Error("a shared map ran script in the new look");
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
	await page.evaluate(() => (document.querySelector("#storage-settings").open = true));
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
console.log(
	JSON.stringify({
		listedFromWebdav: onDav,
		label: await page.textContent("#storage-label"),
		davFiles: davFiles.length,
	}),
);
if (JSON.stringify(onDav) !== JSON.stringify(listed.slice(1)) || !davFiles.includes("/dav/okmaps/index.json"))
	throw new Error("maps were not moved to WebDAV");
await page.click("#maps li a");
await page.waitForSelector("#visualization circle.area", { timeout: 30_000 });
await page.goto(home);
// Back to this browser (nothing to copy: the maps are there already).
await useStorage(async () => {
	await page.check('#storage input[value="browser"]');
});
await page.waitForSelector("#maps li");

// Keep them in a Solid Pod: log in at the identity provider, come back, and
// the maps are copied to okmaps/ at the top of the Pod the WebID names.
await page.evaluate(() => (document.querySelector("#storage-settings").open = true));
await page.check('#storage input[value="solid"]');
await page.fill("#solid-issuer", ISSUER);
await page.click("#storage-save");
await page.waitForFunction(
	() => /now kept|could not/.test(document.querySelector("#storage-status")?.textContent ?? ""),
	null,
	{ timeout: 30_000 },
);
const solidStatus = await page.textContent("#storage-status");
console.log(JSON.stringify({ solid: solidStatus, idp: solid.log }));
if (!/now kept in Solid Pod \(https:\/\/pod\.test\/me\/okmaps\/\)/.test(solidStatus))
	throw new Error("the Pod was not used after logging in");
await page.waitForSelector("#maps li");
const onPod = await page.$$eval("#maps li a", (as) => as.map((a) => a.textContent));
const podFiles = [...solid.pod.tree.keys()].filter((k) => k.startsWith("/me/okmaps/maps/") && k.endsWith(".json"));
if (JSON.stringify(onPod) !== JSON.stringify(onDav) || podFiles.length !== onPod.length)
	throw new Error(`maps were not copied to the Pod: ${JSON.stringify({ onPod, podFiles })}`);
// The map page reads Pod maps from a copy in this browser, made on the way.
await page.click("#maps li a");
await page.waitForSelector("#visualization circle.area", { timeout: 30_000 });
const podMapUrl = page.url();
// Without that copy (a bookmark, say), the main page logs in again silently,
// fetches the map and comes back.
await page.evaluate(
	() =>
		new Promise((r) => {
			const q = indexedDB.deleteDatabase("okmaps-pod-copy");
			q.onsuccess = q.onerror = q.onblocked = r;
		}),
);
const authsBefore = solid.log.filter((l) => l === "GET /auth").length;
await page.goto(podMapUrl);
await page.waitForURL((u) => u.href === podMapUrl, { timeout: 30_000 });
await page.waitForSelector("#visualization circle.area", { timeout: 30_000 });
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
await page.waitForSelector("#maps li");
await page.waitForFunction(
	async () =>
		!(await new Promise((r) => {
			const q = indexedDB.open("okmaps-pod-copy");
			q.onsuccess = () => {
				const g = q.result.transaction("docs").objectStore("docs").get("unsent.json");
				g.onsuccess = () => {
					q.result.close();
					r(g.result);
				};
			};
		})),
);
if (!JSON.parse(solid.pod.tree.get(`/me/okmaps/maps/${podMapId}.json`)).sharedId)
	throw new Error("the map page's change did not reach the Pod");
console.log(
	JSON.stringify({
		listedFromPod: await page.$$eval("#maps li a", (as) => as.map((a) => a.textContent)),
		label: await page.textContent("#storage-label"),
	}),
);
await useStorage(async () => {
	await page.check('#storage input[value="browser"]');
	await page.uncheck('#storage input[name="copy"]');
});
await page.waitForSelector("#maps li");

// An Atomic Data server: requests and commits signed with the agent's key.
const atomicStatus = await useStorage(async () => {
	await page.check('#storage input[value="atomic"]');
	await page.check('#storage input[name="copy"]');
	await page.fill("#atomic-parent", "https://atomic.test/drive/okmaps");
	await page.fill("#atomic-secret", Buffer.from(JSON.stringify(atomicAgent)).toString("base64"));
});
console.log(JSON.stringify({ atomic: atomicStatus }));
if (!/now kept in Atomic Data/.test(atomicStatus)) throw new Error("the Atomic Data server was not used");
await page.reload();
await page.waitForSelector("#maps li");
const onAtomic = await page.$$eval("#maps li a", (as) => as.map((a) => a.textContent));
if (JSON.stringify(onAtomic) !== JSON.stringify(onDav))
	throw new Error(`maps were not copied to Atomic Data: ${JSON.stringify(onAtomic)}`);
await page.click("#maps li a");
await page.waitForSelector("#visualization circle.area", { timeout: 30_000 });
console.log(JSON.stringify({ listedFromAtomic: onAtomic, atomicFiles: atomic.resources.size }));
await page.goto(home);
await useStorage(async () => {
	await page.check('#storage input[value="browser"]');
	await page.uncheck('#storage input[name="copy"]');
});
await page.waitForSelector("#maps li");

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
