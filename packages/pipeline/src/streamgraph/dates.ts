/**
 * The year of a record's date, as the old streamgraph step read it with
 * pandas (`to_datetime(..., utc=True, errors="coerce", format="mixed")`):
 * dates with a time zone count in UTC, and a date pandas can't read
 * (invalid days, ranges such as "2017 Apr-Jun") gives null.
 *
 * pandas hands non-ISO dates to dateutil, which reads far more forms than
 * these; these are the ones BASE and PubMed records use.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const FULL = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function validDay(y: number, m: number, d: number): boolean {
	if (m < 1 || m > 12 || d < 1) return false;
	return d <= DAYS[m - 1] + (m === 2 && leap(y) ? 1 : 0);
}

/** 1-12 for a month name or its three-letter (or "sept") short form, else 0. */
function month(name: string): number {
	const n = name.toLowerCase();
	const i = MONTHS.indexOf(n.slice(0, 3));
	return i >= 0 && (n.length === 3 || n === FULL[i] || n === "sept") ? i + 1 : 0;
}

const ISO =
	/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

export function recordYear(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value !== "string") return null;
	const s = value.trim();
	let m = /^(\d{4})$/.exec(s);
	if (m) return +m[1];
	m = ISO.exec(s);
	if (m) {
		const [y, mo, d] = [+m[1], +m[2], m[3] ? +m[3] : 1];
		if (!validDay(y, mo, d)) return null;
		const [h, mi] = [m[4] ? +m[4] : 0, m[5] ? +m[5] : 0];
		if (h > 23 || mi > 59 || (m[6] && +m[6] > 59)) return null;
		if (!m[7] || m[7].toUpperCase() === "Z") return y;
		const sign = m[7][0] === "-" ? -1 : 1;
		const off = m[7].slice(1).replace(":", "");
		const minutes = sign * (+off.slice(0, 2) * 60 + (off.length > 2 ? +off.slice(2) : 0));
		// Only an offset across midnight on 31 December or 1 January changes the year.
		const t = new Date(0);
		t.setUTCFullYear(y, mo - 1, d);
		t.setUTCHours(h, mi - minutes);
		return t.getUTCFullYear();
	}
	m = /^(\d{4})(\d{2})(\d{2})$/.exec(s) ?? /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
	if (m) return validDay(+m[1], +m[2], +m[3]) ? +m[1] : null;
	m = /^(\d{4}) ([a-z]+)(?: (\d{1,2}))?$/i.exec(s);
	if (m) {
		const mo = month(m[2]);
		return mo && validDay(+m[1], mo, m[3] ? +m[3] : 1) ? +m[1] : null;
	}
	m = /^([a-z]+) (\d{4})$/i.exec(s);
	if (m) return month(m[1]) ? +m[2] : null;
	return null;
}
