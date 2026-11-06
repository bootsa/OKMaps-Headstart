import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { partialRatio, ratio, tokenSortRatio } from "../src/fuzz.js";

const here = path.dirname(fileURLToPath(import.meta.url));
/** test/golden/py/fuzz_golden.py: rapidfuzz scores. */
const golden: { a: string; b: string; ratio: number; partial: number; token_sort: number }[] = JSON.parse(
  zlib.gunzipSync(fs.readFileSync(path.join(here, "golden/fuzz.json.gz"))).toString("utf8"),
);

it(`matches rapidfuzz on ${golden.length} string pairs`, () => {
  const bad = golden.filter(
    (g) =>
      Math.abs(ratio(g.a, g.b) - g.ratio) > 1e-9 ||
      Math.abs(partialRatio(g.a, g.b) - g.partial) > 1e-9 ||
      Math.abs(tokenSortRatio(g.a, g.b) - g.token_sort) > 1e-9,
  );
  expect(bad.slice(0, 3).map((g) => ({ ...g, ts: [ratio(g.a, g.b), partialRatio(g.a, g.b), tokenSortRatio(g.a, g.b)] }))).toEqual([]);
});
