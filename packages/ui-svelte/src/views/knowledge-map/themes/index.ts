/**
 * The map themes and the one in use. Add a theme by building a MapTheme
 * (see types.ts) and passing it to registerTheme, or list it below.
 */
import { labelsTheme } from "./labels";
import { originalTheme } from "./original";
import { octagonShape } from "./shapes";
import type { MapTheme } from "./types";

/** The labels theme in octagons: shows that a theme can change the area shape. */
export const octagonsTheme: MapTheme = {
	...labelsTheme,
	id: "octagons",
	name: "Labels in octagons",
	shape: octagonShape,
};

const themes = new Map<string, MapTheme>();
for (const theme of [labelsTheme, originalTheme, octagonsTheme]) themes.set(theme.id, theme);

export const DEFAULT_THEME = labelsTheme.id;

export function registerTheme(theme: MapTheme): void {
	themes.set(theme.id, theme);
}

export function mapThemes(): MapTheme[] {
	return [...themes.values()];
}

/** The theme with this id, or the default one. */
export function getTheme(id: string | null | undefined): MapTheme {
	return themes.get(id ?? "") ?? (themes.get(DEFAULT_THEME) as MapTheme);
}

const KEY = "okmaps-map-theme";

/** The theme to start with: ?theme= in the page's URL, else the one last picked. */
export function savedTheme(): string {
	try {
		const fromUrl = new URL(window.location.href).searchParams.get("theme");
		if (fromUrl && themes.has(fromUrl)) return fromUrl;
		const saved = window.localStorage.getItem(KEY);
		if (saved && themes.has(saved)) return saved;
	} catch {
		// No window or no storage: use the default.
	}
	return DEFAULT_THEME;
}

/** Remembers the picked theme in this browser. */
export function saveTheme(id: string): void {
	try {
		window.localStorage.setItem(KEY, id);
	} catch {
		// Storage blocked: the pick lasts for this page only.
	}
}

export { circleShape, octagonShape, polygonShape } from "./shapes";
export type { AreaProps, AreaShape, MapTheme, PaperProps, PopupProps } from "./types";
export { labelsTheme, originalTheme };
