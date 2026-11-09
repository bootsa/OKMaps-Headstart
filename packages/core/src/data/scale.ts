/** Scales from data to px, as in the old utils/scale.ts, on d3-scale v4. */
import { scaleLinear, scaleSqrt } from "d3-scale";
import type { MapConfig } from "./config";

const CIRCLE_PADDING = 45;
const COORDS_PADDING = 5;
const ZOOM_PADDING_RATIO = { area: 0.08, paper: 0 };
const ZOOM_PADDING = { area: 60, paper: 35 };

type Extent = [number, number];
export type Scale = (value: number) => number;

/**
 * A scale over a degenerate extent (all values equal) maps everything to the
 * middle of the range for positions, and to its start for sizes (as d3 v3 did:
 * equal papers get the smallest size).
 */
function safe(
	scale: ReturnType<typeof scaleLinear<number>>,
	extent: Extent,
	degenerate: "middle" | "start" = "middle",
): Scale {
	if (extent[0] === extent[1]) {
		const [a, b] = scale.range();
		return degenerate === "start" ? () => a : () => (a + b) / 2;
	}
	return (v) => scale(v);
}

const correction = (size: number, config: MapConfig) => size / config.referenceSize;

/** Paper positions from layout coordinates: fills the chart with a 5 px margin. */
export function initialCoordsScale(extent: Extent, size: number): Scale {
	return safe(
		scaleLinear()
			.domain(extent)
			.range([COORDS_PADDING, size - COORDS_PADDING]),
		extent,
	);
}

/** Area centres: keeps the largest bubble inside the chart. */
export function areaCoordsScale(extent: Extent, size: number, config: MapConfig, bubbleMaxScale: number): Scale {
	const circleMax = config.maxAreaSize * correction(size, config) * bubbleMaxScale;
	const padding = circleMax / 2 + CIRCLE_PADDING;
	return safe(
		scaleLinear()
			.domain(extent)
			.range([padding, size - padding]),
		extent,
	);
}

/** Area radius from the summed size metric (square root). */
export function areaRadiusScale(
	extent: Extent,
	size: number,
	config: MapConfig,
	bubbleMinScale: number,
	bubbleMaxScale: number,
): Scale {
	const c = correction(size, config);
	const range: Extent = [config.minAreaSize * c * bubbleMinScale, config.maxAreaSize * c * bubbleMaxScale];
	return safe(scaleSqrt().domain(extent).range(range) as ReturnType<typeof scaleLinear<number>>, extent, "start");
}

/** Paper diameter from its size metric (square root). */
export function paperDiameterScale(
	extent: Extent,
	size: number,
	config: MapConfig,
	paperMinScale: number,
	paperMaxScale: number,
): Scale {
	const c = correction(size, config);
	const range: Extent = [config.minDiameterSize * c * paperMinScale, config.maxDiameterSize * c * paperMaxScale];
	return safe(scaleSqrt().domain(extent).range(range) as ReturnType<typeof scaleLinear<number>>, extent, "start");
}

/** Zooming into an area: maps the area's span (minus padding) onto the chart. */
export function zoomScale(centre: number, radius: number, size: number, kind: "area" | "paper"): Scale {
	const padding = radius * ZOOM_PADDING_RATIO[kind];
	return scaleLinear()
		.domain([centre - radius + padding, centre + radius - padding])
		.range([ZOOM_PADDING[kind], size - ZOOM_PADDING[kind]]);
}

/** Rescales px from one chart size to another. */
export function resizeScale(from: number, to: number): Scale {
	return (v) => (v / from) * to;
}

/** Bubble and paper scale factors for large maps (dynamic sizing). */
export function resizeFactors(numPapers: number, dynamic: boolean): [paper: number, bubble: number] {
	if (!dynamic || numPapers < 150) return [1, 1];
	if (numPapers < 200) return [0.9, 1.1];
	if (numPapers < 250) return [0.8, 1.1];
	if (numPapers < 300) return [0.7, 1.1];
	if (numPapers < 500) return [0.7, 1.2];
	return [0.6, 1.2];
}
