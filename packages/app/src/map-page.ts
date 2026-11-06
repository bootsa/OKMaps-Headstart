/**
 * map.html?id=...      a map saved in this browser
 * map.html?shared=...  a published map (share link)
 *
 * The existing visualisation draws it, reading it in its local_files mode
 * from a blob URL.
 */
import { domDecode, fetchSharedMap, neutralise, publishMap, shareUrl, type SharedMap } from "./share.ts";
import { settings } from "./settings.ts";
import { registerServiceWorker } from "./offline.ts";
import { getMap, saveMap, type SavedMap } from "./store.ts";
import { visConfig } from "./vis-config.ts";

declare global {
  interface Window {
    data_config?: Record<string, unknown>;
    headstart?: { start: (config?: Record<string, unknown>) => void };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Adds the visualisation's built scripts and styles (written by scripts/build-vis.mjs) in order. */
async function loadVis(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}vis/`;
  const tags = (await (await fetch(`${base}tags.json`)).json()) as { scripts: string[]; styles: string[] };
  for (const href of tags.styles) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = base + href;
    document.head.append(link);
  }
  let last: Promise<unknown> = Promise.resolve();
  for (const src of tags.scripts) {
    const s = document.createElement("script");
    s.src = base + src;
    s.async = false;
    last = new Promise((resolve, reject) => {
      s.onload = resolve;
      s.onerror = () => reject(new Error(`could not load ${src}`));
    });
    document.body.append(s);
  }
  await last;
}

function showMessage(text: string) {
  const el = $("message");
  el.textContent = text;
  el.hidden = false;
}

async function draw(map: SharedMap) {
  document.title = `${map.title} - Open Knowledge Maps`;
  const body = JSON.stringify({ context: map.context, data: JSON.stringify(map.documents) });
  const file = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  window.data_config = visConfig(map.context.service, { title: map.title, file });
  await loadVis();
  window.headstart!.start();
}

/** Share button: publishes the map once and shows its link. */
function offerShare(saved: SavedMap) {
  const button = $<HTMLButtonElement>("share");
  const panel = $("share-panel");
  const input = $<HTMLInputElement>("share-url");
  const show = (id: string) => {
    input.value = shareUrl(id);
    panel.hidden = false;
    input.select();
  };
  button.hidden = false;
  button.onclick = async () => {
    if (saved.sharedId) return show(saved.sharedId);
    button.disabled = true;
    button.textContent = "Sharing…";
    try {
      saved.sharedId = await publishMap(settings.gatewayUrl, saved);
      await saveMap(saved);
      show(saved.sharedId);
    } catch (err) {
      showMessage(`The map could not be shared: ${err instanceof Error ? err.message : err}`);
    } finally {
      button.disabled = false;
      button.textContent = "Share";
    }
  };
  $<HTMLButtonElement>("copy").onclick = async () => {
    await navigator.clipboard?.writeText(input.value).catch(() => input.select());
    $("copy").textContent = "Copied";
  };
}

/** Save button on a shared map: keeps a copy in this browser. */
function offerSave(map: SharedMap, sharedId: string) {
  const button = $<HTMLButtonElement>("save");
  button.hidden = false;
  button.onclick = async () => {
    const id = crypto.randomUUID();
    await saveMap({
      ...map,
      id,
      context: { ...map.context, id },
      created: new Date().toISOString(),
      request: requestOf(map),
      sharedId,
    });
    button.textContent = "Saved to your maps";
    button.disabled = true;
  };
}

/** The search a shared map came from, as far as its context tells. */
function requestOf(map: SharedMap): SavedMap["request"] {
  const p = JSON.parse(map.context.params || "{}");
  if (map.context.service === "openaire") return { service: "openaire", project_id: p.project_id ?? "", funder: p.funder ?? "" };
  const common = { q: map.context.query, from: p.from ?? "", to: p.to ?? "", sorting: p.sorting ?? "most-relevant" };
  return map.context.service === "base"
    ? { service: "base", ...common, document_types: p.document_types ?? [] }
    : { service: "pubmed", ...common };
}

async function main() {
  const params = new URLSearchParams(location.search);
  const shared = params.get("shared");
  if (shared) {
    const map = await fetchSharedMap(settings.gatewayUrl, shared);
    if (!map) return showMessage("This shared map does not exist.");
    const safe = neutralise(map, domDecode);
    offerSave(safe, shared);
    return draw(safe);
  }
  const id = params.get("id");
  const saved = id ? await getMap(id) : undefined;
  if (!saved) return showMessage("This map is not saved in this browser.");
  offerShare(saved);
  return draw(saved);
}

main().catch((err) => showMessage(`The map could not be shown: ${err instanceof Error ? err.message : err}`));
registerServiceWorker();
