/**
 * Metamorphic invariant tests for filterDuplicates, ported from upstream
 * OpenKnowledgeMaps/Headstart (server/workers/base/tests/unit/
 * test_dedup_invariants.py + dedup_invariants.py, commit 81bc472).
 *
 * They need no golden output: they assert relations between an input and a
 * transformed input (shuffled, re-fed, or with an injected record). The
 * golden tests in base-dedup.test.ts pin exact parity on whole responses;
 * these pin the properties the deterministic anchor selection promises.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { computeDoiKey, type DedupRecord, filterDuplicates } from "../src/base/dedup.js";
import type { BaseRecord } from "../src/base/records.js";

type Input = Parameters<typeof filterDuplicates>[0][number];
type Overrides = Partial<Omit<Input, "additional_dois">> & { additional_dois?: string | string[] };

const here = path.dirname(fileURLToPath(import.meta.url));

// --- record builders -----------------------------------------------------------

const DEFAULTS: Input = {
	id: "",
	relation: "",
	identifier: "",
	title: "Title",
	paper_abstract: "Abstract",
	published_in: "Journal",
	year: "2020",
	subject_orig: "",
	subject: "",
	authors: "Author A",
	link: "",
	oa_state: "0",
	url: "",
	relevance: 0,
	resulttype: [],
	type: "",
	typenorm: "1", // "7" = dataset path
	doi: "",
	doi_merge: "",
	additional_dois: "",
	lang: "",
	language: "",
	content_provider: "cp1",
	coverage: "",
	collection: "",
	is_duplicate: false,
	duplicates: "", // the R-side textual-duplicate marking
	has_dataset: false,
};

/** additional_dois arrives as a list in the Python tests; ours is the "; "-joined string. */
const joinDois = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("; ") : (v ?? ""));

function rec(id: string, o: Overrides = {}): Input {
	return { ...DEFAULTS, ...o, id, additional_dois: joinDois(o.additional_dois) } as Input;
}

// --- running & comparing ---------------------------------------------------------

/** The dedup-sensitive fields a tie-break flip can move, compared per survivor. */
const OUTCOME_FIELDS = ["title", "doi", "subject_orig", "subject", "oa_state", "link", "paper_abstract"] as const;

interface Outcome {
	ids: string[];
	records: Record<string, Record<string, unknown>>;
}

function outcome(out: DedupRecord[]): Outcome {
	const records: Outcome["records"] = {};
	for (const r of out) records[r.id] = Object.fromEntries(OUTCOME_FIELDS.map((f) => [f, r[f] ?? ""]));
	return { ids: Object.keys(records).sort(), records };
}

const runDedup = (rows: Input[]) => outcome(filterDuplicates(rows.map((r) => ({ ...r }))));

/** Small seeded PRNG so the shuffles are reproducible. */
function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffled<T>(xs: T[], seed: number): T[] {
	const out = [...xs];
	const rand = mulberry32(seed);
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Identity, reversal (always included: a seeded shuffle can reproduce identity) and seeded shuffles. */
const permutations = <T>(xs: T[]) => [xs, [...xs].reverse(), ...[11, 23, 47].map((s) => shuffled(xs, s))];

/** I1: dedup(shuffle(C)) == dedup(C) on survivors and enriched fields. */
function assertOrderInvariant(rows: Input[], label = ""): Outcome {
	const [first, ...rest] = permutations(rows).map(runDedup);
	rest.forEach((o, i) => expect(o, `${label} I1 violated on permutation ${i + 1}`).toEqual(first));
	return first;
}

/**
 * I2: dedup(dedup(C)) == dedup(C). Re-feeding resets `duplicates` and
 * `is_duplicate`, modelling the upstream textual marker running again on the
 * survivor set and finding nothing: the second pass must change nothing.
 */
function assertIdempotent(rows: Input[]): Outcome {
	const first = filterDuplicates(rows.map((r) => ({ ...r })));
	const refeed = first.map((r) => ({ ...r, duplicates: "", is_duplicate: false }) as Input);
	const a = outcome(first);
	expect(runDedup(refeed), "I2 violated").toEqual(a);
	return a;
}

/** I3-I6 core: adding `record` changes the survivor count by exactly `delta`. */
function assertInjection(rows: Input[], record: Input, delta: number) {
	const before = runDedup(rows);
	const after = runDedup([...rows, record]);
	expect(after.ids.length - before.ids.length, `before=${before.ids} after=${after.ids}`).toBe(delta);
}

// --- order-invariance (the core property) ---------------------------------------

describe("filterDuplicates invariants: order", () => {
	it("leaves disjoint records alone in any order", () => {
		const out = assertOrderInvariant([
			rec("a", { title: "Alpha decay measurement", doi: "10.1/a" }),
			rec("b", { title: "Beta cell function", doi: "10.1/b" }),
			rec("c", { title: "Gamma ray bursts", doi: "10.1/c" }),
		]);
		expect(out.ids).toEqual(["a", "b", "c"]);
	});

	it("keeps the OA member of a discriminated group", () => {
		const out = assertOrderInvariant([
			rec("oa", { duplicates: "closed", oa_state: "1", year: "2020" }),
			rec("closed", { duplicates: "oa", oa_state: "0", year: "2021" }),
		]);
		expect(out.ids).toEqual(["oa"]);
	});

	it("breaks a full ladder tie on content (X14)", () => {
		assertOrderInvariant([
			rec("first", { duplicates: "second", subject_orig: "kw-a", paper_abstract: "An abstract about the topic A" }),
			rec("second", { duplicates: "first", subject_orig: "kw-b", paper_abstract: "An abstract about the topic B" }),
		]);
	});

	it("breaks an all-missing dataset version tie on content (X5)", () => {
		assertOrderInvariant([
			rec("v-plain", {
				typenorm: "7",
				duplicates: "v-dx",
				doi: "https://doi.org/10.6084/m9.figshare.23691672",
				subject_orig: "kw-a",
			}),
			rec("v-dx", {
				typenorm: "7",
				duplicates: "v-plain",
				doi: "https://dx.doi.org/10.6084/m9.figshare.23691672",
				subject_orig: "kw-b",
			}),
		]);
	});

	it("breaks an equal-length abstract tie in enrichment (X13)", () => {
		assertOrderInvariant([
			rec("anchor", { duplicates: "d1,d2", oa_state: "1", paper_abstract: "" }),
			rec("d1", { duplicates: "anchor,d2", oa_state: "0", paper_abstract: "Equal length abstract text A" }),
			rec("d2", { duplicates: "anchor,d1", oa_state: "0", paper_abstract: "Equal length abstract text B" }),
		]);
	});

	it("re-marks anchors across overlapping DOI groups independently of order", () => {
		const title = "On the geometric phase for Majorana and Dirac neutrinos";
		const journalDoi = "https://doi.org/10.1088/1361-6471/ac9fe6";
		assertOrderInvariant([
			rec("journal", { oa_state: "1", year: "2023", doi: journalDoi, title, paper_abstract: "A".repeat(100) }),
			rec("salerno", {
				oa_state: "2",
				year: "2023",
				additional_dois: [journalDoi],
				title,
				paper_abstract: "B".repeat(90),
			}),
			rec("arxiv-copy", {
				oa_state: "1",
				year: "2022",
				additional_dois: [journalDoi],
				duplicates: "datacite",
				title,
				paper_abstract: "C".repeat(95),
			}),
			rec("datacite", {
				oa_state: "1",
				year: "2022",
				additional_dois: [`https://doi.org/10.48550/arxiv.2107.08719; ${journalDoi}`],
				duplicates: "arxiv-copy",
				title,
				paper_abstract: "D".repeat(105),
			}),
		]);
	});
});

// --- idempotence / injection ------------------------------------------------------

describe("filterDuplicates invariants: idempotence and injection", () => {
	it("is idempotent", () => {
		assertIdempotent([
			rec("oa", { duplicates: "closed", oa_state: "1", year: "2020" }),
			rec("closed", { duplicates: "oa", oa_state: "0", year: "2021" }),
			rec("solo", { title: "An unrelated record", doi: "10.1/solo" }),
		]);
	});

	it("is idempotent after a DOI merge", () => {
		assertIdempotent([
			rec("plain", { doi: "10.1234/test", oa_state: "1", title: "Detecting moments of stress" }),
			rec("journal", { doi: "10.1234/test", title: "Sensors / Detecting moments of stress" }),
			rec("solo", { doi: "10.1/solo", title: "An unrelated record" }),
		]);
	});

	it("absorbs an exact copy (I3)", () => {
		const rows = [
			rec("a", { title: "Alpha decay measurement", doi: "10.1/a" }),
			rec("b", { title: "Beta cell function", doi: "10.1/b" }),
		];
		assertInjection(rows, rec("a", { title: "Alpha decay measurement", doi: "10.1/a" }), 0);
	});

	it("merges an unmarked record with the same DOI", () => {
		const rows = [rec("plain", { doi: "10.1234/test", title: "Detecting moments of stress" })];
		assertInjection(rows, rec("journal", { doi: "10.1234/test", title: "Sensors / Detecting moments of stress" }), 0);
	});

	it("merges when the DOI is only in doi_merge (X8)", () => {
		const rows = [rec("linkdoi", { doi: "10.1234/test", title: "Detecting moments of stress" })];
		const copy = rec("dcdoi", {
			doi_merge: "https://dx.doi.org/10.1234/TEST",
			title: "Sensors / Detecting moments of stress",
		});
		assertInjection(rows, copy, 0);
	});

	it("merges case-only DOI variants (X6)", () => {
		const rows = [rec("upper", { doi: "https://doi.org/10.1016/B978.12", title: "Chapter on sensing" })];
		assertInjection(rows, rec("lower", { doi: "https://doi.org/10.1016/b978.12", title: "Chapter on sensing" }), 0);
	});

	it("merges dataset versions to the latest (X4)", () => {
		const out = assertOrderInvariant([
			rec("v1", {
				typenorm: "7",
				doi: "https://doi.org/10.6084/m9.figshare.111.v1",
				title: "A dataset of measurements",
			}),
			rec("v3", {
				typenorm: "7",
				doi: "https://doi.org/10.6084/m9.figshare.111.v3",
				title: "A dataset of measurements",
			}),
		]);
		expect(out.ids).toEqual(["v3"]);
	});

	it("does not fold a mis-indexed paper's keywords into the survivor (X11)", () => {
		const subjects: Record<string, string> = { real: "quantum optics", misindexed: "medieval history" };
		const out = assertOrderInvariant([
			rec("real", {
				doi: "10.1234/shared",
				oa_state: "1",
				title: "Quantum entanglement in photonic crystals",
				subject_orig: subjects.real,
			}),
			rec("misindexed", {
				doi: "10.1234/shared",
				title: "Medieval trade routes of the Baltic",
				subject_orig: subjects.misindexed,
			}),
		]);
		expect(out.ids).toHaveLength(1);
		const [survivor] = out.ids;
		expect(out.records[survivor].subject_orig).toBe(subjects[survivor]);
	});

	it("keeps distinct papers whose DOIs differ only in the article number", () => {
		const out = assertOrderInvariant([
			rec("paper-a", {
				doi: "https://dx.doi.org/10.1016/j.physleta.2015.07.045",
				title: "Entangled entanglement: A construction procedure",
			}),
			rec("paper-b", {
				oa_state: "1",
				additional_dois: ["https://doi.org/10.1016/j.physleta.2015.07.030"],
				title: "Weak interaction processes: Which quantum information is revealed?",
			}),
		]);
		expect(out.ids).toEqual(["paper-a", "paper-b"]);
	});

	it("merges a retitled repository copy asserting the DOI and keeps its OA state", () => {
		const out = assertOrderInvariant([
			rec("publisher", {
				oa_state: "2",
				doi: "https://dx.doi.org/10.1016/j.physleta.2015.07.045",
				title: "Entangled entanglement: A construction procedure",
			}),
			rec("repo-copy", {
				oa_state: "1",
				additional_dois: ["https://doi.org/10.1016/j.physleta.2015.07.045"],
				title: "Entangled Entanglement: The Geometry of GHZ States",
			}),
		]);
		expect(out.ids).toHaveLength(1);
		expect(String(out.records[out.ids[0]].oa_state)).toBe("1");
	});

	it("keeps one survivor for a DOI group straddling the dataset split (X12)", () => {
		const out = assertOrderInvariant([
			rec("dataset-side", { typenorm: "7", doi: "10.5281/zenodo.42", title: "A shared resource" }),
			rec("paper-side", { typenorm: "1", doi: "10.5281/zenodo.42", title: "A shared resource" }),
		]);
		expect(out.ids).toHaveLength(1);
	});

	it("still merges same-title records with different DOIs (pinned scope, no PID-conflict split)", () => {
		const out = runDedup([
			rec("arxiv", { duplicates: "journal", doi: "10.48550/arxiv.1", title: "Designing intent communication" }),
			rec("journal", { duplicates: "arxiv", doi: "10.1145/3771882", title: "Designing intent communication" }),
		]);
		expect(out.ids).toHaveLength(1);
	});
});

// --- real extracted fixtures --------------------------------------------------------

interface Fixture {
	pid_namespace?: string;
	pid_key?: string;
	title_key?: string;
	expected: { groups: number };
	members: Record<string, unknown>[];
}

const CORPORA = ["orcid_v2", "base_v1"] as const;
const loadFixtures = (corpus: string): { merge_fixtures: Fixture[]; split_fixtures: Fixture[] } =>
	JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(here, `fixtures/dedup/${corpus}.json.gz`))).toString("utf8"));

/** Parses the stringified Python list of "; "-joined DOIs the extraction tool wrote. */
function parseAdditionalDois(v: unknown): string {
	if (typeof v !== "string" || !v.startsWith("[")) return typeof v === "string" ? v : "";
	const items = [...v.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? m[2]);
	return items.join("; ");
}

/**
 * One filterDuplicates input from an extracted fixture. `mutual` simulates the
 * R textual-duplicate marking by listing every member in every member's
 * `duplicates`, for scenarios that assume the title pass already linked them.
 */
function fixtureRows(fx: Fixture, mutual: boolean): Input[] {
	const ids = fx.members.map((m) => m.id as string);
	return fx.members.map((m) => {
		const fields: Partial<BaseRecord> = {};
		for (const [k, v] of Object.entries(m))
			if (k in DEFAULTS || k === "relation") (fields as Record<string, unknown>)[k] = v;
		return rec(m.id as string, {
			...fields,
			additional_dois: parseAdditionalDois(m.additional_dois),
			duplicates: mutual ? ids.join(",") : "",
		});
	});
}

const doiKeys = (rows: Input[]) => rows.map((r) => computeDoiKey(r.doi_merge, r.additional_dois, r.doi));

describe.each(CORPORA)("filterDuplicates invariants: real fixtures (%s)", (corpus) => {
	const data = loadFixtures(corpus);

	it("loads the extracted fixtures", () => {
		expect(data.merge_fixtures.length).toBeGreaterThan(0);
		expect(data.split_fixtures.length).toBeGreaterThan(0);
	});

	it("collapses real merge groups on the DOI key alone", () => {
		// Groups that only share a key under bare-.N version stripping (which the
		// key deliberately does not do) rely on the title pass instead.
		for (const fx of data.merge_fixtures.filter((f) => f.pid_namespace === "doi").slice(0, 40)) {
			let rows = fixtureRows(fx, false);
			const singleKey = new Set(doiKeys(rows)).size === 1;
			if (!singleKey) rows = fixtureRows(fx, true);
			const out = runDedup(rows);
			expect(out.ids.length, `${fx.pid_key} single_key=${singleKey}: ${out.ids}`).toBe(fx.expected.groups);
		}
	});

	it("never merges unmarked same-title records across distinct DOI keys", () => {
		// The expectation comes from the coalesced keys, not the extraction label:
		// a repository copy carrying the journal DOI in its dcdoi legitimately merges.
		for (const fx of data.split_fixtures.slice(0, 40)) {
			const rows = fixtureRows(fx, false);
			const keys = doiKeys(rows);
			const expected = new Set(keys.filter((k) => k)).size + keys.filter((k) => !k).length;
			const out = runDedup(rows);
			expect(out.ids.length, `${fx.title_key?.slice(0, 40)} keys=${keys}: ${out.ids}`).toBe(expected);
		}
	});

	it("is order invariant on real merge groups", () => {
		for (const fx of data.merge_fixtures.slice(0, 25)) assertOrderInvariant(fixtureRows(fx, true), fx.pid_key);
	});
});
