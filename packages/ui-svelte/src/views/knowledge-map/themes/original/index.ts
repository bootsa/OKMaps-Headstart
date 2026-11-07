import Bubble from "../../Bubble.svelte";
import { circleShape } from "../shapes";
import type { MapTheme } from "../types";
import OriginalPaper from "./OriginalPaper.svelte";

/**
 * The original Open Knowledge Maps look: each paper a sheet with its
 * details written on it, growing under the pointer when zoomed in. Papers
 * keep their layout positions.
 */
export const originalTheme: MapTheme = {
	id: "original",
	name: "Original",
	shape: circleShape,
	Area: Bubble,
	Paper: OriginalPaper,
};
