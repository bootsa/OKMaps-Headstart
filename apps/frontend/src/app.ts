/**
 * This build's config (packages/config; okmaps.config.json, read by
 * vite.config.ts) and what every page does with it first. The modules it
 * chose are registered by register-sources.ts, register-stores.ts and
 * register-views.ts, each imported only by the pages that need them.
 */

import config from "virtual:okmaps/config";
import { applyScheme, initialScheme, setDefaultScheme } from "@okmaps/ui-svelte";

export { config };
export const features = config.features;

/** The page title for `what` ("Settings" -> "Settings - <site title>"). */
export const pageTitle = (what?: string) => (what ? `${what} - ${config.site.title}` : config.site.title);

/**
 * Light or dark, from the person's choice or the site's default. Without
 * the switch the site's default (or the system's) is the only one.
 */
export function startScheme(): void {
	const scheme = config.theme.scheme;
	if (features.schemeToggle) {
		setDefaultScheme(scheme);
		applyScheme(initialScheme());
	} else {
		setDefaultScheme(scheme);
		const dark = scheme === "dark" || (scheme === "system" && matchMedia?.("(prefers-color-scheme: dark)").matches);
		applyScheme(dark ? "dark" : "light");
	}
}
