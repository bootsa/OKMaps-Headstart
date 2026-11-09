/**
 * A config's theme as CSS: the design tokens of @okmaps/ui-svelte
 * (styles/tokens.css) set on <html>, light and dark. Anything that reads
 * the tokens follows, custom elements included (custom properties pass
 * into shadow DOM).
 */
import type { ResolvedConfig, Theme } from "./types.ts";

/** The light tokens: the shorthands first, then `tokens` (which win). */
export function themeTokens(theme: Theme): Record<string, string> {
	const t: Record<string, string> = {};
	if (theme.accent) {
		t["--color-accent"] = theme.accent;
		t["--color-open-access"] = theme.accent;
		t["--color-focus"] = theme.accent;
	}
	if (theme.heading) {
		t["--color-heading"] = theme.heading;
		t["--color-accent-strong"] = theme.heading;
	}
	if (theme.font) t["--font-sans"] = theme.font;
	return { ...t, ...theme.tokens };
}

const block = (selector: string, tokens: Record<string, string>) => {
	const lines = Object.entries(tokens).map(([k, v]) => `\t${k}: ${v};`);
	return lines.length ? `${selector} {\n${lines.join("\n")}\n}\n` : "";
};

/**
 * The theme's CSS. Its selectors weigh more than the skins' and the dark
 * tokens', so the config wins over both. Colours (--color-*) are for the
 * light scheme; the dark one keeps its own unless `darkTokens` give them.
 */
export function themeCss(theme: Theme, extraCss = ""): string {
	const tokens = Object.entries(themeTokens(theme));
	const colours = Object.fromEntries(tokens.filter(([k]) => k.startsWith("--color-")));
	const others = Object.fromEntries(tokens.filter(([k]) => !k.startsWith("--color-")));
	return (
		block(":root:root", others) +
		block(':root:root:not([data-scheme="dark"])', colours) +
		block(':root:root[data-scheme="dark"]', theme.darkTokens ?? {}) +
		(theme.logo
			? ".okm-site-logo { display: block; max-height: 4rem; max-width: 100%; margin-bottom: 0.5rem; }\n"
			: "") +
		extraCss
	);
}

/** What goes in every page's <head> and on <html> for this config. */
export function pageHead(config: ResolvedConfig, extraCss = ""): { head: string; htmlAttrs: Record<string, string> } {
	const t = config.theme;
	const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
	const parts: string[] = [];
	if (t.fontStylesheet) parts.push(`<link rel="stylesheet" href="${esc(t.fontStylesheet)}" />`);
	const css = themeCss(t, extraCss);
	if (css) parts.push(`<style id="okmaps-theme">\n${css}</style>`);
	const htmlAttrs: Record<string, string> = { lang: config.site.lang };
	if (t.skin) htmlAttrs["data-skin"] = t.skin;
	return { head: parts.join("\n    "), htmlAttrs };
}
