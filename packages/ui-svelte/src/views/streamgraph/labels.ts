/**
 * Where a streamgraph puts each stream's label (old utils/streamgraph.ts):
 * at the stream's widest point, kept inside the chart, then moved up or
 * down, one column of labels at a time, until no two overlap.
 */

export interface LabelBox {
	key: string;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Labels with the same centre form a column. */
	centerX: number;
}

/** The colour swatch before the text and the label's white border (px). */
export const SWATCH_WIDTH = 12;
export const SWATCH_GAP = 3;
export const BORDER = 5;
const EDGE = BORDER + 1;
const PADDING_LEFT = 8;

/** A label of `textWidth` x `textHeight` centred on the stream's widest point (px). */
export function labelBox(
	key: string,
	peak: { x: number; top: number; bottom: number },
	textWidth: number,
	textHeight: number,
	chartWidth: number,
): LabelBox {
	const width = textWidth + SWATCH_WIDTH + SWATCH_GAP + 2 * EDGE;
	const height = textHeight + 2 * EDGE;
	let x = peak.x - width / 2;
	if (x + width > chartWidth) x = chartWidth - width;
	if (x < PADDING_LEFT) x = PADDING_LEFT;
	const y = peak.top + (peak.bottom - peak.top) / 2 - height / 2 + EDGE;
	return { key, x, y, width, height, centerX: x + width / 2 };
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const overlap = (a: LabelBox, b: LabelBox) =>
	a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

const shift = (moved: LabelBox, other: LabelBox, down: boolean) =>
	down ? other.height + other.y - moved.y : -moved.height + other.y - moved.y;

function columns(labels: LabelBox[]): LabelBox[][] {
	const sorted = [...labels].sort((a, b) =>
		near(a.centerX, b.centerX) ? (near(a.y, b.y) ? 0 : -Math.sign(a.y - b.y)) : Math.sign(a.centerX - b.centerX),
	);
	const out: LabelBox[][] = [];
	for (const label of sorted) {
		const last = out[out.length - 1];
		if (last && last[0].centerX === label.centerX) last.push(label);
		else out.push([label]);
	}
	return out;
}

/** Pushes the labels below `offset` px down while each still overlaps the next. */
function pushDown(labels: LabelBox[], offset: number) {
	labels.sort((a, b) => a.y - b.y);
	for (let i = 0; i < labels.length - 1; i++) {
		labels[i].y += offset;
		if (!overlap(labels[i], labels[i + 1])) break;
		offset = -shift(labels[i], labels[i + 1], false);
	}
}

/** Moves overlapping labels apart; returns new boxes, the input is left as it was. */
export function separateLabels(input: LabelBox[]): LabelBox[] {
	const labels = input.map((l) => ({ ...l }));
	const placed = new Set<LabelBox>();
	let down = false;
	for (const column of columns(labels)) {
		down = !down;
		const order = (a: LabelBox, b: LabelBox) => (down ? a.y - b.y : b.y - a.y);
		column.sort(order);
		for (const label of column) {
			const done = labels.filter((l) => placed.has(l)).sort(order);
			for (const other of done) if (overlap(label, other)) label.y += shift(label, other, down);
			if (label.y < 0) {
				const over = -label.y;
				label.y = 0;
				pushDown(done, over);
			}
			placed.add(label);
		}
	}
	return labels;
}
