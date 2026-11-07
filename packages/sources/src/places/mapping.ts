/**
 * From table rows to the records a geo map draws. Which column holds what
 * is configuration (PlaceMapping), so any table of places, not only
 * AQUANAVI's mesocosm facilities, can become a geo map.
 *
 * The record shape is the one the old AQUANAVI API returned
 * (legacy/workers/common/common/aquanavi/mapping.py): the place goes in
 * `coverage` as "country=..; continent=..; east=<lon>; north=<lat>;
 * start=..; end=..", which the geo map view reads.
 */
import type { Row } from "./csv.js";

export interface DescriptionSection {
	/** The column the text comes from. */
	column: string;
	/** Written before the text: "Equipment" gives "Equipment: ...". */
	label: string;
	/** Label of the "description not available" line when the cell is empty (default `label`); null leaves the section out. */
	missing?: string | null;
	/** Lines of a multi-line cell are joined with this (default " "). */
	join?: string;
	/** Drop one full stop at the end (default true). */
	trimDot?: boolean;
}

export interface PlaceMapping {
	/** Column with the place's name. */
	title: string;
	/** Column with the place's web page. */
	url?: string;
	/** Column with an image URL. */
	image?: string;
	country?: string;
	continent?: string;
	/** Column with both coordinates as "[lat, lon]" (Python list syntax; quoted numbers allowed). */
	location?: string;
	/** Columns with the coordinates on their own (used when `location` is not set). */
	latitude?: string;
	longitude?: string;
	/** Column with a free-text time span ("2016 - present", "since 2009", "2019 - 2022"). */
	years?: string;
	/** The parts of the description, in order. */
	description?: DescriptionSection[];
	/** Put between the description parts (default "\n \n"). */
	descriptionJoin?: string;
	/** Column with keywords; the lines of a multi-line cell are joined with "; ". */
	keywords?: string;
	/** Document type of every record (default "physical object"). */
	type?: string;
	resulttype?: string[];
	/** The record id; by default the SHA-256 (hex) of the url and location cells. */
	id?(row: Row): string | Promise<string>;
}

/** One place, in the record shape the geo map view reads. */
export interface PlaceRecord {
	id: string;
	title: string;
	identifier: string;
	link: string;
	type: string;
	resulttype: string[];
	authors: string;
	year: string;
	language: string;
	oa_state: string;
	published_in: string;
	/** Image URL. */
	relation: string;
	paper_abstract: string;
	/** Keywords, "; "-separated. */
	subject_orig: string;
	coverage: string;
}

const cell = (row: Row, column: string | undefined) => (column ? (row[column] ?? "") : "");
/** Python's str.strip(). */
const PY_SPACE = "[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const PY_STRIP = new RegExp(`^${PY_SPACE}+|${PY_SPACE}+$`, "g");
const strip = (s: string) => s.replace(PY_STRIP, "");

/** A cell's text; the lines of a multi-line cell joined with `join`. */
function joined(value: string, join: string): string {
	const s = strip(value);
	if (!s.includes("\n")) return s;
	return s.split("\n").map(strip).filter(Boolean).join(join);
}

/** The time span of a "years" cell, or [null, null] for forms it doesn't know. */
export function timeSpan(text: string): [string | null, string | null] {
	const t = strip(text).toLowerCase().replaceAll("—", "-");
	if (!t) return [null, null];
	let m = /(\d{4})\s*-\s*present/.exec(t);
	if (m) return [m[1], "present"];
	m = /(\d{4})\s*-\s*(\d{4})/.exec(t);
	if (m) return [m[1], m[2]];
	m = /(\d{4})\s*to\s*present/.exec(t) ?? /since\s*(\d{4})/.exec(t);
	if (m) return [m[1], "present"];
	m = /(?:started|starting|operational since)\s*(\d{4})/.exec(t);
	if (m) return [m[1], "present"];
	return [null, null];
}

const NUMBER = /^[+-]?(?:\d+(?:_\d+)*\.?\d*(?:_\d+)*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Python's float() of a string, or null. */
function toFloat(s: string): number | null {
	const t = strip(s);
	return NUMBER.test(t) ? Number(t.replaceAll("_", "")) : null;
}

/** "[lat, lon]" or "('lat', 'lon')" to numbers (ast.literal_eval of a two-item list or tuple). */
export function parseLocation(text: string): [number, number] | null {
	const s = strip(text);
	if (!s.includes(",")) return null;
	const m = /^(\[|\()\s*(.*?)\s*(\]|\))$/s.exec(s);
	if (!m || (m[1] === "[") !== (m[3] === "]")) return null;
	const items = m[2].match(/'[^']*'|"[^"]*"|[^,]+/g)?.map((x) => x.trim()) ?? [];
	const rest = m[2].replace(/'[^']*'|"[^"]*"|[^,]+/g, "").replace(/\s/g, "");
	if (items.length !== 2 || rest !== ",") return null;
	const nums = items.map((x) => toFloat(/^(['"]).*\1$/s.test(x) ? x.slice(1, -1) : x));
	return nums[0] === null || nums[1] === null ? null : [nums[0], nums[1]];
}

// Markers at the same spot are spread on a small golden-angle spiral.
const MAX_OFFSET_METERS = 30;
const GROWTH_FACTOR = 6;
const GOLDEN_ANGLE = (137.50776405003785 * Math.PI) / 180;
const METERS_PER_DEGREE_LAT = 111_111;

/** Moves the n-th duplicate of a spot (n >= 1) a few metres away. */
export function offsetDuplicate(lat: number, lon: number, n: number): [number, number] {
	if (n <= 0) return [lat, lon];
	const angle = n * GOLDEN_ANGLE;
	const radius = Math.min(GROWTH_FACTOR * Math.sqrt(n), MAX_OFFSET_METERS);
	const east = radius * Math.cos(angle);
	const north = radius * Math.sin(angle);
	const perDegreeLon = METERS_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
	return [lat + north / METERS_PER_DEGREE_LAT, lon + east / perDegreeLon];
}

/** Python's repr() of a float: "12.0", "1e-07". */
export function pyFloat(n: number): string {
	if (Number.isInteger(n) && Math.abs(n) < 1e16) return n.toFixed(1);
	return String(n).replace(/e([+-])(\d)$/, "e$10$2");
}

async function sha256(text: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function description(row: Row, mapping: PlaceMapping): string {
	const sections = mapping.description ?? [];
	let missing = 0;
	const parts: string[] = [];
	for (const s of sections) {
		const value = cell(row, s.column);
		if (strip(value) === "") {
			missing++;
			if (s.missing !== null) parts.push(`${s.missing ?? s.label}: description not available`);
			continue;
		}
		let text = joined(value, s.join ?? " ");
		if ((s.trimDot ?? true) && text.endsWith(".")) text = text.slice(0, -1);
		parts.push(`${s.label}: ${text}`);
	}
	return missing === sections.length ? "" : parts.join(mapping.descriptionJoin ?? "\n \n");
}

function coordinates(row: Row, mapping: PlaceMapping): [number, number] | null {
	if (mapping.location) return parseLocation(cell(row, mapping.location));
	const lat = toFloat(cell(row, mapping.latitude));
	const lon = toFloat(cell(row, mapping.longitude));
	return lat === null || lon === null ? null : [lat, lon];
}

/**
 * The rows as place records, in table order. Rows identical in every
 * column are kept once.
 */
export async function toPlaceRecords(rows: Row[], mapping: PlaceMapping): Promise<PlaceRecord[]> {
	const seenRows = new Set<string>();
	const seenSpots = new Map<string, number>();
	const out: PlaceRecord[] = [];
	for (const row of rows) {
		const key = JSON.stringify(row);
		if (seenRows.has(key)) continue;
		seenRows.add(key);

		const url = strip(cell(row, mapping.url));
		const id = mapping.id
			? await mapping.id(row)
			: await sha256(url + strip(cell(row, mapping.location ?? mapping.latitude)));
		let spot = coordinates(row, mapping);
		if (spot) {
			const k = `${spot[0]},${spot[1]}`;
			const n = seenSpots.get(k) ?? 0;
			seenSpots.set(k, n + 1);
			spot = offsetDuplicate(spot[0], spot[1], n);
		}
		const [start, end] = mapping.years ? timeSpan(cell(row, mapping.years)) : [null, null];
		const country = strip(cell(row, mapping.country));
		const continent = strip(cell(row, mapping.continent));
		// As the old API wrote it: a missing country is "country= ", a 0 coordinate counts as missing.
		const coverage = [
			cell(row, mapping.country) ? `country=${country}` : "country= ",
			cell(row, mapping.continent) ? `continent=${continent}` : "continent= ",
			spot?.[1] ? `east=${pyFloat(spot[1])}` : "east=",
			spot?.[0] ? `north=${pyFloat(spot[0])}` : "north=",
			start ? `start=${start}` : "start=",
			end ? `end=${end}` : "end=",
		].join("; ");
		out.push({
			id,
			title: strip(cell(row, mapping.title)),
			identifier: id,
			link: url,
			type: mapping.type ?? "physical object",
			resulttype: mapping.resulttype ?? ["Other/Unknown material"],
			authors: "",
			year: "",
			language: "",
			oa_state: "",
			published_in: "",
			relation: cell(row, mapping.image),
			paper_abstract: description(row, mapping),
			subject_orig: mapping.keywords ? joined(cell(row, mapping.keywords), "; ") : "",
			coverage,
		});
	}
	return out;
}
