/** Text helpers for the list (old templates/listentry). */

const MAX_TITLE_LENGTH = 164;
const MAX_AUTHORS_LENGTH = 100;
const MAX_AUTHORS = 15;

/** Cuts a long title so title and date fit in the old 164 characters. */
export function shortTitle(title: string, dateLength: number): string {
	const max = MAX_TITLE_LENGTH - dateLength;
	return title.length > max ? `${title.slice(0, max - 3).trim()}...` : title;
}

/**
 * Authors as one line: at most 15 names (the first 14, "...", the last) and,
 * unless `full`, at most 100 characters.
 */
export function authorsLine(list: string[], full = false): string {
	if (!list.length) return "";
	if (list.length > MAX_AUTHORS) return `${list.slice(0, MAX_AUTHORS - 1).join(", ")}, ... ${list[list.length - 1]}`;
	const max = full ? Number.POSITIVE_INFINITY : MAX_AUTHORS_LENGTH;
	let line = list[0];
	for (let i = 1; i < list.length; i++) {
		const more = i < list.length - 1 ? 3 : 0;
		if (line.length + 2 + list[i].length + more > max) return `${line}...`;
		line += `, ${list[i]}`;
	}
	return line;
}

/** Tags in front of a BASE entry: its document types, without dataset and unknown. */
export function docTypeTags(types: string[]): string[] {
	const isDataset = types.some((t) => t.toLowerCase() === "dataset");
	return types
		.filter((t) => t.toLowerCase() !== "dataset" && !t.toLowerCase().includes("unknown"))
		.slice(0, isDataset ? 1 : 2);
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
