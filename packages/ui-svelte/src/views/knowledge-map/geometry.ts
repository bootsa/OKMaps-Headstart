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
	return geometry;
}

/** A paper with its top-right corner folded. */
export function paperPath({ x, y, w, h }: Rect): string {
	return `M ${x} ${y} h ${(1 - DOGEAR) * w} l ${DOGEAR * w} ${DOGEAR * h} v ${(1 - DOGEAR) * h} h ${-w} v ${-h}`;
}

/** The fold of the paper's corner. */
export function dogEarPath({ x, y, w, h }: Rect): string {
	return `M ${x + (1 - DOGEAR) * w} ${y} v ${DOGEAR * h} h ${DOGEAR * w}`;
}

/** A rounded card, for datasets, media and software. */
export function roundedPath({ x, y, w, h }: Rect): string {
	const r = ROUNDED_RADIUS;
	const lw = w - 2 * r;
	const lh = h - 2 * r;
	return (
		`M ${x} ${y + r} v ${lh} a ${r} ${r} 0 0 0 ${r} ${r} h ${lw} ` +
		`a ${r} ${r} 1 0 0 ${r} ${-r} v ${-lh} a ${r} ${r} 0 0 0 ${-r} ${-r} h ${-lw} a ${r} ${r} 0 0 0 ${-r} ${r} Z`
	);
}

/**
 * A hovered paper grows so its metadata fits, at most to half the chart's
 * height. The old code measured the text and grew it step by step; a fixed
 * factor reads the same and does not depend on layout.
 */
export function enlarge(rect: Rect, size: number, factor = 2): Rect {
	const k = Math.max(1, Math.min(factor, size / 2 / rect.h));
	return { x: rect.x, y: rect.y, w: rect.w * k, h: rect.h * k };
}

/** Cuts a long author list to `max` names, keeping the last one. */
export function cutAuthors(list: string[], max = 15): string {
	if (list.length <= max) return list.join(", ");
	return `${list.slice(0, max - 1).join(", ")}, ... ${list[list.length - 1]}`;
}
