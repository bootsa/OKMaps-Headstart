/**
 * Light or dark mode for the whole page: sets data-scheme on <html>, which
 * the dark tokens (styles/tokens.css) follow. Starts from ?scheme= in the
 * URL, else the last choice in this browser, else the system's setting.
 */
export type Scheme = "light" | "dark";

const KEY = "okmaps-scheme";

export function initialScheme(): Scheme {
	try {
		const fromUrl = new URL(window.location.href).searchParams.get("scheme");
		if (fromUrl === "light" || fromUrl === "dark") return fromUrl;
		const saved = window.localStorage.getItem(KEY);
		if (saved === "light" || saved === "dark") return saved;
		return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	} catch {
		return "light";
	}
}

/** Shows the page in `scheme`; with `save`, remembers it in this browser. */
export function applyScheme(scheme: Scheme, save = false): void {
	if (typeof document === "undefined") return;
	document.documentElement.dataset.scheme = scheme;
	if (!save) return;
	try {
		window.localStorage.setItem(KEY, scheme);
	} catch {
		// Storage blocked: the choice lasts for this page only.
	}
}
