/**
 * index.html: the search form and the maps saved in this browser.
 */
import { errorMessage } from "./messages.ts";
import { registerServiceWorker } from "./offline.ts";
import { placeSettings } from "./places.ts";
import type { MapRecord, SearchRequest, Service, Stage } from "./search.ts";
import { settings } from "./settings.ts";
import { KNOWN_ISSUERS } from "./solid-login.ts";
import {
	chooseStorage,
	currentStorage,
	deleteMap,
	finishSolidLogin,
	getMap,
	LoggedOut,
	listMaps,
	type MapSummary,
	moveOldMaps,
	readChoice,
	requestPersistence,
	type StorageChoice,
	saveMap,
	solidLoginAgain,
	startSolidLogin,
} from "./store.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("search");
const status = $<HTMLParagraphElement>("status");
const submit = $<HTMLButtonElement>("submit");

const STAGES: Record<Stage, string> = {
	searching: "Searching…",
	citations: "Getting citation counts…",
	layout: "Laying out the map…",
};
const places = placeSettings();
const SERVICES: Record<string, string> = {
	pubmed: "PubMed",
	base: "BASE",
	openaire: "OpenAIRE",
	...Object.fromEntries(places.map((p) => [p.id, p.label])),
};

// The Pages build publishes several versions side by side (../versions.html).
if (import.meta.env.VITE_APP_VERSION) {
	const v = $<HTMLParagraphElement>("version");
	const other = Object.assign(document.createElement("a"), {
		href: `${import.meta.env.BASE_URL}../versions.html`,
		textContent: "other versions",
	});
	v.append(`Version ${import.meta.env.VITE_APP_VERSION} · `, other);
	v.hidden = false;
}

const today = new Date().toISOString().slice(0, 10);
$<HTMLInputElement>("to").value = today;

// A source choice per place source; its value is "place:<id>".
{
	const fieldset = form.querySelector("fieldset.services")!;
	for (const p of places) {
		const label = document.createElement("label");
		const input = Object.assign(document.createElement("input"), {
			type: "radio",
			name: "service",
			value: `place:${p.id}`,
		});
		label.append(input, ` ${p.label}`);
		fieldset.append(label);
	}
}

const choice = () => String(new FormData(form).get("service") ?? "pubmed");

function currentService(): Service {
	const c = choice();
	return c.startsWith("place:") ? "places" : (c as Service);
}

/** Shows the fields of the chosen service and its default start date. */
function updateFields() {
	const service = currentService();
	for (const el of form.querySelectorAll<HTMLElement>("[data-services]")) {
		const on = el.dataset.services!.split(" ").includes(service);
		el.hidden = !on;
		for (const input of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))
			input.disabled = !on;
	}
	const from = $<HTMLInputElement>("from");
	if (!from.dataset.touched) from.value = service === "base" ? "1665-01-01" : "1809-01-01";
}
form.addEventListener("change", (e) => {
	if ((e.target as HTMLElement).id === "from") $<HTMLInputElement>("from").dataset.touched = "1";
	if ((e.target as HTMLInputElement).name === "service") updateFields();
});
// BASE needs the gateway (registered IP and API key).
if (!settings.gatewayUrl) {
	const base = form.querySelector<HTMLInputElement>('input[name="service"][value="base"]')!;
	base.disabled = true;
	base.parentElement!.append(" (needs a gateway)");
}
updateFields();

function readRequest(): SearchRequest {
	const f = new FormData(form);
	const s = (k: string) => String(f.get(k) ?? "").trim();
	const service = currentService();
	if (service === "openaire") return { service, project_id: s("project_id"), funder: s("funder") };
	if (service === "places") return { service, source: choice().slice("place:".length), title: s("place_title") };
	const common = {
		q: s("q"),
		from: s("from"),
		to: s("to"),
		sorting: s("sorting") as "most-relevant" | "most-recent",
	};
	const vis_type = s("vis_type") === "timeline" ? ("timeline" as const) : undefined;
	const withView = vis_type ? { ...common, vis_type } : common;
	if (service === "base") return { service, ...withView, document_types: f.getAll("document_types").map(String) };
	return { service, ...withView };
}

function titleOf(req: SearchRequest): string {
	if (req.service === "openaire") return `Project ${req.project_id} (${req.funder})`;
	if (req.service === "places") {
		const p = places.find((x) => x.id === req.source);
		return req.title || p?.title || p?.label || req.source;
	}
	return req.q;
}

function runWorker(request: SearchRequest): Promise<MapRecord> {
	const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
	return new Promise<MapRecord>((resolve, reject) => {
		worker.onmessage = (e) => {
			const msg = e.data;
			if (msg.type === "stage") status.textContent = STAGES[msg.stage as Stage];
			else if (msg.type === "done") resolve(msg.map);
			else if (msg.type === "error") reject(Object.assign(new Error(msg.message), { reasons: msg.reasons }));
		};
		worker.onerror = (e) => reject(new Error(e.message));
		worker.postMessage({ request, settings: { ...settings, places } });
	}).finally(() => worker.terminate());
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	const request = readRequest();
	submit.disabled = true;
	status.className = "status";
	status.textContent = STAGES.searching;
	try {
		const map = await runWorker(request);
		const id = map.context.id;
		await saveMap({ ...map, id, created: new Date().toISOString(), request, title: titleOf(request) });
		void requestPersistence();
		location.href = `map.html?id=${encodeURIComponent(id)}`;
	} catch (err) {
		const reasons = (err as { reasons?: string[] }).reasons ?? [];
		status.className = "status error";
		status.textContent = errorMessage(reasons, err instanceof Error ? err.message : String(err));
		submit.disabled = false;
	}
});

function renderMaps(maps: MapSummary[]) {
	const list = $<HTMLUListElement>("maps");
	list.replaceChildren();
	$<HTMLParagraphElement>("no-maps").hidden = maps.length > 0;
	for (const m of maps) {
		const li = document.createElement("li");
		const a = document.createElement("a");
		a.href = `map.html?id=${encodeURIComponent(m.id)}`;
		a.textContent = m.title;
		// The map page reads Pod maps from the copy in this browser: make it first.
		a.onclick = async (e) => {
			if (readChoice().kind !== "solid") return;
			e.preventDefault();
			await getMap(m.id).catch(() => undefined);
			location.href = a.href;
		};
		const meta = document.createElement("span");
		meta.className = "meta";
		meta.textContent = `${SERVICES[m.service] ?? m.service} · ${m.documents} documents · ${new Date(m.created).toLocaleString()}`;
		const del = document.createElement("button");
		del.type = "button";
		del.className = "delete";
		del.textContent = "Delete";
		del.setAttribute("aria-label", `Delete map ${m.title}`);
		del.onclick = async () => {
			await deleteMap(m.id);
			await showMaps();
		};
		li.append(a, meta, del);
		list.append(li);
	}
}
async function showMaps() {
	const label = await currentStorage().then(
		(st) => st.label,
		() => "your storage",
	);
	$("storage-label").textContent = label;
	try {
		renderMaps(await listMaps());
	} catch (err) {
		renderMaps([]);
		const note = $<HTMLParagraphElement>("no-maps");
		note.textContent = `Your maps could not be read from ${label}: ${err instanceof Error ? err.message : err}.`;
		if (err instanceof LoggedOut) {
			const again = document.createElement("button");
			again.type = "button";
			again.textContent = "Log in again";
			again.onclick = () => solidLoginAgain(err.issuer);
			note.append(" ", again);
		}
	}
}

// Where maps are kept.
const storageForm = $<HTMLFormElement>("storage");
const storageStatus = $<HTMLParagraphElement>("storage-status");
function showStorageFields() {
	const kind = new FormData(storageForm).get("kind");
	for (const el of storageForm.querySelectorAll<HTMLElement>("[data-kinds]")) {
		const on = el.dataset.kinds!.split(" ").includes(String(kind));
		el.hidden = !on;
		for (const input of el.querySelectorAll("input")) input.disabled = !on;
	}
}
{
	const choice = readChoice();
	storageForm.querySelector<HTMLInputElement>(`input[name="kind"][value="${choice.kind}"]`)!.checked = true;
	if (choice.kind === "webdav") {
		$<HTMLInputElement>("dav-url").value = choice.url;
		$<HTMLInputElement>("dav-user").value = choice.username ?? "";
		$<HTMLInputElement>("dav-password").value = choice.password ?? "";
	}
	if (choice.kind === "atomic") {
		$<HTMLInputElement>("atomic-parent").value = choice.parent;
		$<HTMLInputElement>("atomic-secret").value = choice.secret;
	}
	if (choice.kind === "solid") {
		$<HTMLInputElement>("solid-issuer").value = choice.issuer;
		$<HTMLInputElement>("solid-container").value = choice.container;
	}
	$("solid-issuers").append(...KNOWN_ISSUERS.map((i) => Object.assign(document.createElement("option"), { value: i })));
}
function storageProblem(err: unknown): string {
	// A network error from a browser usually means the server does not allow this site (CORS).
	return err instanceof TypeError
		? "it could not be reached, or it does not allow this site (CORS)"
		: err instanceof Error
			? err.message
			: String(err);
}
showStorageFields();
storageForm.addEventListener("change", showStorageFields);
storageForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	const f = new FormData(storageForm);
	const field = (k: string) => String(f.get(k) ?? "").trim();
	const copy = f.get("copy") === "on";
	const button = $<HTMLButtonElement>("storage-save");
	button.disabled = true;
	storageStatus.className = "status";
	storageStatus.textContent = "Checking…";
	try {
		if (f.get("kind") === "solid") {
			storageStatus.textContent = "Sending you to log in…";
			await startSolidLogin(field("issuer"), field("container"), copy);
			return;
		}
		const kind = f.get("kind");
		const choice: StorageChoice =
			kind === "webdav"
				? { kind: "webdav", url: field("url"), username: field("username"), password: String(f.get("password") ?? "") }
				: kind === "atomic"
					? { kind: "atomic", parent: field("parent"), secret: field("secret") }
					: { kind: "browser" };
		const copied = await chooseStorage(choice, copy);
		storageStatus.textContent = `Your maps are now kept in ${(await currentStorage()).label}${copied ? `; ${copied} copied there` : ""}.`;
		await showMaps();
	} catch (err) {
		storageStatus.className = "status error";
		storageStatus.textContent = `That storage could not be used: ${storageProblem(err)}. Your maps stay where they were.`;
	} finally {
		button.disabled = false;
	}
});

/** Back from logging in to a Pod: switch to it. */
async function afterSolidLogin() {
	try {
		const done = await finishSolidLogin();
		if (!done) return;
		$<HTMLDetailsElement>("storage-settings").open = true;
		storageStatus.className = "status";
		storageStatus.textContent = `Your maps are now kept in ${(await currentStorage()).label}${done.copied ? `; ${done.copied} copied there` : ""}.`;
	} catch (err) {
		$<HTMLDetailsElement>("storage-settings").open = true;
		storageStatus.className = "status error";
		storageStatus.textContent = `Your Pod could not be used: ${storageProblem(err)}. Your maps stay where they were.`;
	}
}

/** ?open=<id>: the map page asks for a Pod map it has no copy of. */
async function openRequested() {
	// Logging in to the Pod may pass through the identity provider, which
	// comes back here and puts the query back afterwards.
	await currentStorage().catch(() => undefined);
	const id = new URLSearchParams(location.search).get("open");
	if (!id) return;
	const map = await getMap(id).catch(() => undefined);
	history.replaceState(null, "", location.pathname);
	if (map) location.replace(`map.html?id=${encodeURIComponent(id)}`);
}

afterSolidLogin()
	.then(openRequested)
	.then(() => moveOldMaps())
	.catch(() => 0)
	.finally(showMaps);
registerServiceWorker();
