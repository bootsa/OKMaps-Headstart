import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cleanSubject } from "../src/base/subjects.js";

const here = path.dirname(fileURLToPath(import.meta.url));
/** test/golden/r/subject_golden.R: clean_subject_string on real BASE subjects. */
const golden: { subject: string[]; doaj: boolean[]; overview: string[]; timeline: string[] } = JSON.parse(
  zlib.gunzipSync(fs.readFileSync(path.join(here, "golden/subject_cleaning.json.gz"))).toString("utf8"),
);

describe("BASE subject cleaning", () => {
  for (const visType of ["overview", "timeline"] as const) {
    it(`matches clean_subject_string for ${visType} maps on ${golden.subject.length} subjects`, () => {
      const mismatches: { subject: string; doaj: boolean; r: string; ts: string }[] = [];
      golden.subject.forEach((s, i) => {
        const ts = cleanSubject(s, visType === "timeline" ? "timeline" : null, golden.doaj[i]);
        if (ts !== golden[visType][i]) mismatches.push({ subject: s, doaj: golden.doaj[i], r: golden[visType][i], ts });
      });
      expect(mismatches.slice(0, 5)).toEqual([]);
      expect(mismatches.length).toBe(0);
    });
  }
});
