/**
 * index.html: the search form and the maps saved in this browser.
 */
import { errorMessage } from "./messages.ts";
import type { SearchRequest, Service, Stage, MapRecord } from "./search.ts";
import { settings } from "./settings.ts";
import { deleteMap, listMaps, requestPersistence, saveMap, type MapSummary } from "./store.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("search");
const status = $<HTMLParagraphElement>("status");
const submit = $<HTMLButtonElement>("submit");

const STAGES: Record<Stage, string> = {
  searching: "Searching…",
  citations: "Getting citation counts…",
  layout: "Laying out the map…",
};
const SERVICES: Record<Service, string> = { pubmed: "PubMed", base: "BASE", openaire: "OpenAIRE" };

const today = new Date().toISOString().slice(0, 10);
$<HTMLInputElement>("to").value = today;

function currentService(): Service {
  return (new FormData(form).get("service") as Service) ?? "pubmed";
}

/** Shows the fields of the chosen service and its default start date. */
function updateFields() {
  const service = currentService();
  for (const el of form.querySelectorAll<HTMLElement>("[data-services]")) {
    const on = el.dataset.services!.split(" ").includes(service);
    el.hidden = !on;
    for (const input of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) input.disabled = !on;
  }
  const from = $<HTMLInputElement>("from");
  if (!from.dataset.touched) from.value = service === "base" ? "1665-01-01" : "1809-01-01";
}
form.addEventListener("change", (e) => {
  if ((e.target as HTMLElement).id === "from") $<HTMLInputElement>("from").dataset.touched = "1";
  if ((e.target as HTMLInputElement).name === "service") updateFields();
});
updateFields();

function readRequest(): SearchRequest {
  const f = new FormData(form);
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const service = currentService();
  if (service === "openaire") return { service, project_id: s("project_id"), funder: s("funder") };
  const common = {
    q: s("q"),
    from: s("from"),
    to: s("to"),
    sorting: s("sorting") as "most-relevant" | "most-recent",
  };
  if (service === "base") return { service, ...common, document_types: f.getAll("document_types").map(String) };
  return { service, ...common };
}

function titleOf(req: SearchRequest): string {
  return req.service === "openaire" ? `Project ${req.project_id} (${req.funder})` : req.q;
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
    worker.postMessage({ request, settings });
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
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${SERVICES[m.request.service]} · ${m.documents} documents · ${new Date(m.created).toLocaleString()}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete";
    del.textContent = "Delete";
    del.setAttribute("aria-label", `Delete map ${m.title}`);
    del.onclick = async () => {
      await deleteMap(m.id);
      renderMaps(await listMaps());
    };
    li.append(a, meta, del);
    list.append(li);
  }
}
listMaps().then(renderMaps, () => ($<HTMLParagraphElement>("no-maps").textContent = "Saved maps can't be read in this browser."));
