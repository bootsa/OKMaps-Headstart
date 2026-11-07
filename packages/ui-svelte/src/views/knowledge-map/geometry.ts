/**
 * Where the bubbles and papers of a knowledge map are drawn: their overview
 * positions, or the zoomed-in ones (the old reducers/areas.ts zoomAreas),
 * and the SVG paths of a paper (templates/Paper.tsx).
 */
import { zoomScale } from "../../data/scale";
import type { Area, Paper } from "../../data/types";

/** Share of the chart the zoomed bubble fills (old config zoom_factor). */
export const ZOOM_FACTOR = 0.9;
export const DOGEAR = 0.15;
const ROUNDED_RADIUS = 10;

export interface Circle {
	x: number;
	y: number;
	r: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Positions of every bubble (by uri) and paper (by safeId). */
export interface Geometry {
	areas: Record<string, Circle>;
	papers: Record<string, Rect>;
}

/** What a theme adds to the zoomed-in positions (see themes/types.ts). */
export interface Placement {
	/** Share of the area's radius inside its outline (1 for a circle). */
	inset?: number;
	/** Moves the zoomed-in papers within the area. */
	placePapers?(rects: Rect[], circle: Circle, size: number): void;
}

export function mapGeometry(
	areas: Area[],
	papers: Paper[],
	size: number,
	zoomed?: Area,
	placement: Placement = {},
): Geometry {
	const geometry: Geometry = { areas: {}, papers: {} };
	if (!zoomed) {
		for (const a of areas) geometry.areas[a.uri] = { x: a.x, y: a.y, r: a.r };
		for (const p of papers) geometry.papers[p.safeId] = { x: p.x, y: p.y, w: p.width, h: p.height };
		return geometry;
	}
	const bx = zoomScale(zoomed.x, zoomed.r, size, "area");
	const by = zoomScale(zoomed.y, zoomed.r, size, "area");
	const px = zoomScale(zoomed.x, zoomed.r, size, "paper");
	const py = zoomScale(zoomed.y, zoomed.r, size, "paper");
	const k = (size / 2 / zoomed.r) * ZOOM_FACTOR;
	for (const a of areas) geometry.areas[a.uri] = { x: bx(a.x), y: by(a.y), r: a.r * k };
	for (const p of papers) geometry.papers[p.safeId] = { x: px(p.x), y: py(p.y), w: p.width * k, h: p.height * k };
	const area = geometry.areas[zoomed.uri];
	placement.placePapers?.(
		zoomed.papers.map((p) => geometry.papers[p.safeId]).filter(Boolean),
		{ ...area, r: area.r * (placement.inset ?? 1) },
		size,
	);
	return geometry;
}

/** Room a zoomed-in paper takes: its icon plus the title beside it. */
export const LABEL_WIDTH = 150;

/** Width of a zoomed-in paper's title: 150 px, narrower on small charts. */
export function labelWidth(size: number): number {
	return Math.round(Math.min(LABEL_WIDTH, Math.max(80, size * 0.34)));
}
const LABEL_GAP = 6;
const LABEL_HEIGHT = 34;
const PADDING = 4;

/**
 * Moves the papers of a zoomed-in area apart until their icons and titles no
 * longer overlap, keeping them inside the area's circle where there is
 * room. Each paper's icon and title are placed as one box, centred where
 * the paper was, and the group as a whole is centred in the circle. Each
 * overlapping pair is pushed apart along the axis where they overlap
 * least. Changes `rects` in place.
 */
export function declutter(rects: Rect[], circle: Circle, label = LABEL_WIDTH, rounds = 200): void {
	const boxes = rects.map((r) => {
		const icon = iconRect(r, true);
		const w = icon.w + LABEL_GAP + label;
		const left = icon.w / 2;
		// cx is the icon's centre; start with the whole box centred on the paper.
		return { r, cx: r.x + r.w / 2 - (w / 2 - left), cy: r.y + r.h / 2, left, w, h: Math.max(icon.h, LABEL_HEIGHT) };
	});
	type Box = (typeof boxes)[number];
	const middle = (b: Box) => ({ x: b.cx - b.left + b.w / 2, y: b.cy });
	const edge = (b: Box) => ({
		l: b.cx - b.left - PADDING,
		r: b.cx - b.left + b.w + PADDING,
		t: b.cy - b.h / 2 - PADDING,
		b: b.cy + b.h / 2 + PADDING,
	});
	const pushApart = (): boolean => {
		let moved = false;
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const a = edge(boxes[i]);
				const b = edge(boxes[j]);
				const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
				const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
				if (ox <= 0 || oy <= 0) continue;
				moved = true;
				// Ties (same place) still need a direction.
				const sy = Math.sign(boxes[j].cy - boxes[i].cy) || (i % 2 ? 1 : -1);
				const sx = Math.sign(boxes[j].cx - boxes[i].cx) || 1;
				if (oy <= ox) {
					boxes[i].cy -= (sy * oy) / 2;
					boxes[j].cy += (sy * oy) / 2;
				} else {
					boxes[i].cx -= (sx * ox) / 2;
					boxes[j].cx += (sx * ox) / 2;
				}
			}
		}
		return moved;
	};
	// Pull each box's middle towards the circle's centre until the whole box
	// fits inside (half way per round when `soft`).
	const keepInside = (soft: boolean) => {
		for (const b of boxes) {
			const m = middle(b);
			const max = Math.max(0, circle.r - Math.hypot(b.w / 2 + PADDING, b.h / 2 + PADDING));
			const d = Math.hypot(m.x - circle.x, m.y - circle.y);
			if (d <= max) continue;
			const k = (soft ? (max + d) / 2 : max) / d;
			b.cx += circle.x + (m.x - circle.x) * k - m.x;
			b.cy += circle.y + (m.y - circle.y) * k - m.y;
		}
	};
	// Centre the group's bounding box in the circle.
	const centre = () => {
		if (!boxes.length) return;
		const e = boxes.map(edge);
		const dx = circle.x - (Math.min(...e.map((b) => b.l)) + Math.max(...e.map((b) => b.r))) / 2;
		const dy = circle.y - (Math.min(...e.map((b) => b.t)) + Math.max(...e.map((b) => b.b))) / 2;
		for (const b of boxes) {
			b.cx += dx;
			b.cy += dy;
		}
	};
	centre();
	for (let round = 0; round < rounds && pushApart(); round++) keepInside(true);
	centre();
	for (let round = 0; round < rounds; round++) {
		keepInside(false);
		if (!pushApart()) break;
	}
	// The circle can push boxes back together: finish with pushes only, so
	// titles never overlap.
	for (let round = 0; round < rounds && pushApart(); round++);
	// A crowded area may now reach past its edge: then stack the papers in
	// rows that follow the circle, if that keeps more of them inside.
	const spill = () => Math.max(0, ...boxes.map((b) => outside(edge(b), circle)));
	if (spill() > 0) {
		const before = boxes.map((b) => ({ cx: b.cx, cy: b.cy }));
		const worst = spill();
		inRows(boxes, circle, middle);
		if (spill() >= worst) {
			boxes.forEach((b, i) => {
				b.cx = before[i].cx;
				b.cy = before[i].cy;
			});
		}
	}
	for (const b of boxes) {
		b.r.x = b.cx - b.r.w / 2;
		b.r.y = b.cy - b.r.h / 2;
	}
}

/** How far the box's farthest corner lies outside the circle (0 if inside). */
function outside(e: { l: number; r: number; t: number; b: number }, c: Circle): number {
	const dx = Math.max(Math.abs(e.l - c.x), Math.abs(e.r - c.x));
	const dy = Math.max(Math.abs(e.t - c.y), Math.abs(e.b - c.y));
	return Math.max(0, Math.hypot(dx, dy) - c.r);
}

interface RowBox {
	cx: number;
	cy: number;
	left: number;
	w: number;
	h: number;
}

/**
 * Lays boxes out in rows centred in the circle, each row holding as many
 * boxes as fit across the circle at its height, in their reading order
 * (top to bottom, then left to right). Uses the fewest rows that hold all.
 */
function inRows<B extends RowBox>(boxes: B[], c: Circle, middle: (b: B) => { x: number; y: number }): void {
	const rowH = Math.max(...boxes.map((b) => b.h)) + 2 * PADDING;
	const colW = Math.max(...boxes.map((b) => b.w)) + 2 * PADDING;
	const capacity = (rows: number) =>
		Array.from({ length: rows }, (_, i) => {
			const top = c.y - (rows * rowH) / 2 + i * rowH;
			const dy = Math.max(Math.abs(top - c.y), Math.abs(top + rowH - c.y));
			const chord = 2 * Math.sqrt(Math.max(0, c.r * c.r - dy * dy));
			return Math.max(1, Math.floor(chord / colW));
		});
	let rows = 1;
	let caps = capacity(rows);
	while (caps.reduce((a, b) => a + b, 0) < boxes.length && rows < boxes.length) caps = capacity(++rows);
	// Fill the widest rows first when there is room to spare.
	let spare = caps.reduce((a, b) => a + b, 0) - boxes.length;
	const order = caps
		.map((_, i) => i)
		.sort((a, b) => caps[a] - caps[b] || Math.abs(b - rows / 2) - Math.abs(a - rows / 2));
	for (const i of order) {
		while (spare > 0 && caps[i] > 1) {
			caps[i]--;
			spare--;
		}
	}
	const sorted = [...boxes].sort((a, b) => a.cy - b.cy);
	let next = 0;
	caps.forEach((n, i) => {
		const row = sorted.slice(next, next + n).sort((a, b) => a.cx - b.cx);
		next += n;
		const y = c.y - (rows * rowH) / 2 + i * rowH + rowH / 2;
		row.forEach((b, j) => {
			const x = c.x + (j - (row.length - 1) / 2) * colW;
			const m = middle(b);
			b.cx += x - m.x;
			b.cy += y - m.y;
		});
	});
}

/** A paper grown by `factor` (from its top-left corner), at most half the chart high. */
export function enlarge(rect: Rect, size: number, factor = 2): Rect {
	const k = Math.max(1, Math.min(factor, size / 2 / rect.h));
	return { x: rect.x, y: rect.y, w: rect.w * k, h: rect.h * k };
}

/** A paper with its top-right corner folded. */
export function paperPath({ x, y, w, h }: Rect): string {
	return `M ${x} ${y} h ${(1 - DOGEAR) * w} l ${DOGEAR * w} ${DOGEAR * h} v ${(1 - DOGEAR) * h} h ${-w} v ${-h}`;
}

/** The fold of the paper's corner. */
export function dogEarPath({ x, y, w, h }: Rect): string {
	return `M ${x + (1 - DOGEAR) * w} ${y} v ${DOGEAR * h} h ${DOGEAR * w}`;
}

/** A rounded card, for datasets, media and software (corner radius `r`). */
export function roundedPath({ x, y, w, h, r = ROUNDED_RADIUS }: Rect & { r?: number }): string {
	const lw = w - 2 * r;
	const lh = h - 2 * r;
	return (
		`M ${x} ${y + r} v ${lh} a ${r} ${r} 0 0 0 ${r} ${r} h ${lw} ` +
		`a ${r} ${r} 1 0 0 ${r} ${-r} v ${-lh} a ${r} ${r} 0 0 0 ${-r} ${-r} h ${-lw} a ${r} ${r} 0 0 0 ${-r} ${r} Z`
	);
}

/** Width to height of a paper icon (old paper_width_factor / paper_height_factor). */
const ICON_RATIO = 1.2 / 1.6;
export const ICON_MIN = 18;
export const ICON_MAX = 44;

/**
 * The document icon for a paper, centred where the paper sat. In the
 * overview it fills the paper's place; zoomed in it stays icon-sized
 * (18 to 44 px high, still bigger for more relevant papers) so the title
 * can sit beside it.
 */
export function iconRect(rect: Rect, zoom: boolean): Rect {
	if (!zoom) return rect;
	const h = Math.max(ICON_MIN, Math.min(ICON_MAX, rect.h * 0.45));
	const w = h * ICON_RATIO;
	return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h };
}

/**
 * Where a popup of `w` × `h` px goes next to an icon: right of it if it
 * fits in the chart, else left, moved up or down to stay inside.
 */
export function popupPlacement(icon: Rect, size: number, w: number, h: number, gap = 8): { x: number; y: number } {
	const right = icon.x + icon.w + gap;
	const x = right + w <= size ? right : Math.max(0, icon.x - gap - w);
	const y = Math.max(0, Math.min(size - h, icon.y + icon.h / 2 - h / 2));
	return { x, y };
}

/** Cuts a long author list to `max` names, keeping the last one. */
export function cutAuthors(list: string[], max = 15): string {
	if (list.length <= max) return list.join(", ");
	return `${list.slice(0, max - 1).join(", ")}, ... ${list[list.length - 1]}`;
}
