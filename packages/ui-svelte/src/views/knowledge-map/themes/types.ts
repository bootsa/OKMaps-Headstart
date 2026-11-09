/**
 * A map theme: how a knowledge map looks. The map's layout (where areas sit
 * and how big they are) is shared by every theme; a theme decides how an
 * area is drawn, where papers go when zoomed in, how a paper is drawn and
 * what pops up next to it. Its components carry their own CSS.
 */

import type { Circle, Paper, Rect } from "@okmaps/core";
import type { Component } from "svelte";

/** The outline of an area, drawn in the area's circle. */
export interface AreaShape {
	/** SVG path of the outline. */
	path(circle: Circle): string;
	/**
	 * Share of the circle's radius that lies inside the outline everywhere
	 * (1 for a circle): papers are kept within it.
	 */
	inset: number;
}

export interface PaperProps {
	paper: Paper;
	/** Where the paper sits: its full place, overview or zoomed in. */
	rect: Rect;
	/** Chart size in px. */
	size: number;
	/** The map is zoomed into the paper's area. */
	zoom?: boolean;
	selected?: boolean;
	hovered?: boolean;
	/** Dataset, media or software rather than a text document. */
	rounded?: boolean;
	search?: string[];
	query?: string[];
	onclick?: (e: MouseEvent | KeyboardEvent) => void;
	onpointerenter?: () => void;
	onpointerleave?: () => void;
}

export interface PopupProps {
	paper: Paper;
	rect: Rect;
	size: number;
	search?: string[];
	query?: string[];
}

export interface AreaProps {
	title: string;
	circle: Circle;
	/** Default: a circle. */
	shape?: AreaShape;
	hovered?: boolean;
	zoomed?: boolean;
	dimmed?: boolean;
	showTitle?: boolean;
	query?: string[];
	onclick?: () => void;
	ondblclick?: () => void;
	onpointerenter?: () => void;
}

export interface MapTheme {
	/** Short name, used in the URL (?theme=) and saved in the browser. */
	id: string;
	/** Shown in the style picker. */
	name: string;
	shape: AreaShape;
	/** Draws an area: its outline and title. */
	Area: Component<AreaProps>;
	Paper: Component<PaperProps>;
	/** Shown next to the paper under the pointer, zoomed in. */
	Popup?: Component<PopupProps>;
	/**
	 * Moves the zoomed-in papers (`rects`, changed in place) within the
	 * area's `circle`, already shrunk to fit inside the shape. Without it
	 * papers keep their scaled-up layout positions.
	 */
	placePapers?(rects: Rect[], circle: Circle, size: number): void;
}
