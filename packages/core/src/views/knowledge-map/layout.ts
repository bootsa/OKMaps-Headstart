/**
 * Separates the bubbles and the papers of a knowledge map, as the old
 * utils/force.ts did. That code used d3 v3's force layout only as a
 * countdown (alpha × 0.99 per tick, stopping below 0.005); the moves are
 * plain collision pushes, so a loop gives the same positions.
 *
 * Areas: pulled back towards the centre when they overflow the chart, and
 * pushed apart when they overlap. Papers: pulled into their area's circle
 * and pushed apart from each other.
 */
import type { MapConfig } from "../../data/config";
import type { Area, Paper } from "../../data/types";

const AREA_TICKS = 10;
const PAPER_TICKS = 15;
const PAPERS_ALPHA = 0.1;

interface Circle {
	x: number;
	y: number;
	r: number;
}

/** d3 v3's alpha after `ticks` ticks. */
function cool(alpha: number, ticks: number): number {
	let a = alpha;
	for (let i = 0; i < ticks; i++) {
		a *= 0.99;
		if (a < 0.005) return 0;
	}
	return a;
}

function push(a: Circle, b: Circle, strength: number) {
	let dx = a.x - b.x;
	let dy = a.y - b.y;
	let l = Math.sqrt(dx * dx + dy * dy);
	const d = a.r + b.r;
	if (l < d) {
		l = ((l - d) / l) * strength;
		dx *= l;
		dy *= l;
		a.x -= dx;
		a.y -= dy;
		b.x += dx;
		b.y += dy;
	}
}

export function layoutAreas(areas: Area[], size: number, alpha: number): void {
	const k = AREA_TICKS + 1;
	let a = alpha;
	while (a > 0) {
		const step = a * k;
		a = cool(a, AREA_TICKS);
		areas.forEach((area, i) => {
			if (area.x - area.r < 0 || area.x + area.r > size || area.y - area.r < 0 || area.y + area.r > size) {
				area.x += (size / 2 - area.x) * step;
				area.y += (size / 2 - area.y) * step;
			}
			for (const other of areas.slice(i + 1)) push(area, other, step);
		});
	}
}

const paperCircle = (p: Paper): Circle => ({
	x: p.x + p.width / 2,
	y: p.y + p.height / 2,
	r: (p.diameter / 2) * 1.2,
});

/**
 * Papers are placed by their top-left corner (x, y), as in the old code:
 * the force works on the circle around each paper.
 */
export function layoutPapers(papers: Paper[], areas: Area[], alpha: number = PAPERS_ALPHA): void {
	const k = PAPER_TICKS + 1;
	const byUri = new Map(areas.map((a) => [a.uri, a]));
	const place = (p: Paper, c: Circle) => {
		p.x = c.x - p.width / 2;
		p.y = c.y - p.height / 2;
	};
	let a = alpha;
	while (a > 0) {
		const step = a * k;
		a = cool(a, PAPER_TICKS);
		papers.forEach((p, i) => {
			const area = byUri.get(p.areaUri);
			const c = paperCircle(p);
			if (area) {
				const distance = Math.hypot(area.x - c.x, area.y - c.y);
				if (distance > Math.abs(area.r - c.r)) {
					c.y += (area.y - c.y) * step;
					c.x += (area.x - c.x) * step;
					place(p, c);
				}
			}
			for (const q of papers.slice(i + 1)) {
				const cq = paperCircle(q);
				push(c, cq, step);
				place(p, c);
				place(q, cq);
			}
		});
	}
}

/** Lays out a processed knowledge map in place. */
export function layoutMap(areas: Area[], papers: Paper[], size: number, config: MapConfig): void {
	layoutAreas(areas, size, config.areaForceAlpha);
	layoutPapers(papers, areas);
}
