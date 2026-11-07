import Bubble from "../../Bubble.svelte";
import { declutter, labelWidth } from "../../geometry";
import { circleShape } from "../shapes";
import type { MapTheme } from "../types";
import LabelPaper from "./LabelPaper.svelte";
import PaperPopup from "./PaperPopup.svelte";

/**
 * Small document icons; zoomed in, each title sits beside its icon and the
 * details pop up on hover. Icons and titles are moved apart and kept
 * inside the area.
 */
export const labelsTheme: MapTheme = {
	id: "labels",
	name: "Labels",
	shape: circleShape,
	Area: Bubble,
	Paper: LabelPaper,
	Popup: PaperPopup,
	placePapers: (rects, circle, size) => declutter(rects, circle, labelWidth(size)),
};
