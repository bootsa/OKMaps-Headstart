/**
 * Text folded for matching: lower case and without accents and other
 * combining marks, so "muller" finds "Müller" and "Muller" finds "müller".
 */
export function fold(text: string): string {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * `text` folded, with the index in `text` where each folded code unit comes
 * from (and `text.length` at the end), to map a match back to the original.
 */
export function foldWithPositions(text: string): { folded: string; positions: number[] } {
	let folded = "";
	const positions: number[] = [];
	let i = 0;
	for (const ch of text) {
		const f = fold(ch);
		for (let k = 0; k < f.length; k++) positions.push(i);
		folded += f;
		i += ch.length;
	}
	positions.push(text.length);
	return { folded, positions };
}
