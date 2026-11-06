/**
 * Share links: a map is published to the gateway (POST /maps) and opened by
 * anyone with map.html?shared=<id>.
 */
import type { MapRecord } from "./search.ts";

export interface SharedMap extends MapRecord {
  title: string;
}

const SHARED_ID = /^[0-9a-f]{24}$/;

export async function publishMap(gatewayUrl: string, map: SharedMap, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(`${gatewayUrl.replace(/\/$/, "")}/maps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: map.title, context: map.context, documents: map.documents }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? `publishing failed (${res.status})`);
  return body.id;
}

export async function fetchSharedMap(gatewayUrl: string, id: string, fetchFn: typeof fetch = fetch): Promise<SharedMap | null> {
  if (!SHARED_ID.test(id)) return null;
  const res = await fetchFn(`${gatewayUrl.replace(/\/$/, "")}/maps/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`the map could not be loaded (${res.status})`);
  return (await res.json()) as SharedMap;
}

/**
 * Makes a map from someone else safe to show. The visualisation decodes
 * HTML entities in every field and puts area titles into the page as HTML,
 * so a crafted shared map could run script. Each string is decoded until
 * nothing changes, and the characters that can start markup or an entity
 * are replaced with look-alikes.
 */
export function neutralise<T>(value: T, decode: (s: string) => string): T {
  const clean = (s: string) => {
    let prev = s;
    for (let i = 0; i < 5; i++) {
      const next = decode(prev);
      if (next === prev) break;
      prev = next;
    }
    return prev.replace(/</g, "‹").replace(/>/g, "›").replace(/&/g, "＆");
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return clean(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Decodes HTML entities the way the visualisation does (a textarea never runs markup). */
export function domDecode(s: string): string {
  if (!s.includes("&")) return s;
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
}

export function shareUrl(id: string): string {
  return new URL(`map.html?shared=${id}`, location.href).href;
}
