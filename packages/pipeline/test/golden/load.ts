import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const goldenDir = path.join(here, "data");
export const casesDir = path.resolve(here, "../../../../server/workers/tests/knowncases");

export interface Golden {
  name: string;
  service: string;
  query: string;
  languages: string[] | null;
  stopword_count: number;
  ids: string[];
  stemmed: string[];
  terms: string[];
  distances: number[];
  merge: number[][];
  height: number[];
  ev: number[];
  num_clusters: number;
  groups: number[];
  layout: number[][];
  layout_b?: number[][];
  subject: Array<string | null>;
  subject_is_heuristic: boolean[];
  type_counts: Record<string, number>;
  labels: string[];
}

export function goldenNames(): string[] {
  return fs
    .readdirSync(goldenDir)
    .filter((f) => f.endsWith(".json.gz"))
    .map((f) => f.replace(/\.json\.gz$/, ""))
    .sort();
}

export function loadGolden(name: string): Golden {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(goldenDir, `${name}.json.gz`))).toString("utf8"));
}

export interface KnownCase {
  params: Record<string, unknown> & { service: string; q: string };
  text: Array<{ id: string; content: string }>;
  metadata: Array<Record<string, unknown> & { id: string }>;
}

export function loadCase(name: string): KnownCase {
  const d = JSON.parse(fs.readFileSync(path.join(casesDir, `${name}.json`), "utf8"));
  const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  return { params: d.params, text: parse(d.input_data.text), metadata: parse(d.input_data.metadata) };
}
