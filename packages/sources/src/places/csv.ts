/**
 * A small CSV reader (RFC 4180: quoted fields with commas, line breaks and
 * doubled quotes). The first line names the columns; blank lines are
 * skipped and missing cells are "", as pandas' read_csv(...).fillna("")
 * gives them.
 */
export type Row = Record<string, string>;

export function parseCsv(text: string, delimiter = ","): Row[] {
	const records: string[][] = [];
	let field = "";
	let record: string[] = [];
	let quoted = false;
	let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const endRecord = () => {
		record.push(field);
		field = "";
		if (record.length > 1 || record[0] !== "") records.push(record);
		record = [];
	};
	for (; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c !== '"') field += c;
			else if (text[i + 1] === '"') {
				field += '"';
				i++;
			} else quoted = false;
		} else if (c === '"') quoted = true;
		else if (c === delimiter) {
			record.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			endRecord();
		} else field += c;
	}
	if (field !== "" || record.length > 0) endRecord();
	const [header = [], ...rows] = records;
	return rows.map((r) => Object.fromEntries(header.map((name, k) => [name, r[k] ?? ""])));
}
