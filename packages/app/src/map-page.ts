/**
 * map.html?id=...: shows a saved map with the existing visualisation, which
 * reads it in its local_files mode from a blob URL.
 */
import { getMap } from "./store.ts";
import { visConfig } from "./vis-config.ts";

declare global {
  interface Window {
    data_config?: Record<string, unknown>;
    headstart?: { start: (config?: Record<string, unknown>) => void };
  }
}

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
  const el = document.getElementById("message")!;
  el.textContent = text;
  el.hidden = false;
}

async function main() {
  const id = new URLSearchParams(location.search).get("id");
  const map = id ? await getMap(id) : undefined;
  if (!map) {
    showMessage("This map is not saved in this browser.");
    return;
  }
  document.title = `${map.title} - Open Knowledge Maps`;
  const body = JSON.stringify({ context: map.context, data: JSON.stringify(map.documents) });
  const file = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  window.data_config = visConfig(map.context.service, { title: map.title, file });
  await loadVis();
  window.headstart!.start();
}

main().catch((err) => showMessage(`The map could not be shown: ${err instanceof Error ? err.message : err}`));
