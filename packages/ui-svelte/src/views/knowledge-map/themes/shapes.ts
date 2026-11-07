/** Area outlines a theme can use. */
import type { AreaShape } from "./types";

export const circleShape: AreaShape = {
	path: ({ x, y, r }) => `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`,
	inset: 1,
};

/** A regular polygon of `sides` corners on the circle, one corner at the top. */
export function polygonShape(sides: number): AreaShape {
	return {
		path: ({ x, y, r }) =>
			`${Array.from({ length: sides }, (_, i) => {
				const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
				return `${i ? "L" : "M"} ${x + r * Math.cos(a)} ${y + r * Math.sin(a)}`;
			}).join(" ")} Z`,
		inset: Math.cos(Math.PI / sides),
	};
}

/** Corners at every 45°, so the area's title square still fits. */
export const octagonShape = polygonShape(8);
