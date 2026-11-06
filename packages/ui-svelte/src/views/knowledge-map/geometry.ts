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

export function mapGeometry(areas: Area[], papers: Paper[], size: number, zoomed?: Area): Geometry {
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
	declutter(zoomed.papers.map((p) => geometry.papers[p.safeId]).filter(Boolean), geometry.areas[zoomed.uri]);
	return geometry;
}

/** Room a zoomed-in paper takes: its icon plus the title beside it. */
export const LABEL_WIDTH = 150;
const LABEL_GAP = 6;
const LABEL_HEIGHT = 34;
const PADDING = 4;

/**
 * Moves the papers of a zoomed-in area apart until their icons and titles no
 * longer overlap, keeping them inside the area's circle where there is
 * room. Each overlapping pair is pushed apart along the axis where they
 * overlap least. Changes `rects` in place.
 */
export function declutter(rects: Rect[], circle: Circle, rounds = 200): void {
	const boxes = rects.map((r) => {
		const icon = iconRect(r, true);
		return {
			r,
			cx: r.x + r.w / 2,
			cy: r.y + r.h / 2,
			left: icon.w / 2,
			w: icon.w + LABEL_GAP + LABEL_WIDTH,
			h: Math.max(icon.h, LABEL_HEIGHT),
		};
	});
	const edge = (b: (typeof boxes)[number]) => ({
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
	// Pull each box's middle back towards the circle, leaving room for the box.
	const keepInside = () => {
		for (const b of boxes) {
			const mx = b.cx - b.left + b.w / 2;
			const my = b.cy;
			const max = Math.max(0, circle.r - Math.hypot(b.w, b.h) / 2);
			const d = Math.hypot(mx - circle.x, my - circle.y);
			if (d > max) {
				const k = (max + d) / 2 / d;
				b.cx += circle.x + (mx - circle.x) * k - mx;
				b.cy += circle.y + (my - circle.y) * k - my;
			}
		}
	};
	for (let round = 0; round < rounds && pushApart(); round++) keepInside();
	// The circle can push boxes back together: finish with pushes only, so
	// titles never overlap (a crowded area may then reach past its edge).
	for (let round = 0; round < rounds && pushApart(); round++);
	for (const b of boxes) {
		b.r.x = b.cx - b.r.w / 2;
		b.r.y = b.cy - b.r.h / 2;
	}
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
