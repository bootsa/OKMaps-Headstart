/** Share and embed links, as the old share, Twitter, email and embed buttons made them. */
import type { MapState } from "../../../data/state.svelte";

/** Gives the address others can open the map at (e.g. after publishing it). */
export type LinkMaker = (map: MapState) => string | Promise<string>;

/** By default: this page, without its #fragment. */
export const pageLink: LinkMaker = () => window.location.href.replace(/#.*/, "");

/** What the share and embed modals are opened with. */
export interface LinkRequest {
	kind: "share" | "embed";
	link: LinkMaker;
	hashtags?: string;
	width?: number;
	height?: number;
}

export interface ShareTarget {
	id: string;
	label: string;
	href: string;
}

/** Email, X (Twitter) and Facebook links for a map's address. */
export function shareTargets(url: string, title: string, description = "", hashtags = ""): ShareTarget[] {
	const u = encodeURIComponent(url);
	const t = encodeURIComponent(title);
	const body = encodeURIComponent(description ? `${description} ${url}` : url);
	const tags = hashtags ? `&hashtags=${encodeURIComponent(hashtags)}` : "";
	return [
		{ id: "email", label: "Email", href: `mailto:?subject=${t}&body=${body}` },
		{ id: "twitter", label: "X (Twitter)", href: `https://twitter.com/intent/tweet?url=${u}${tags}&text=${t}` },
		{ id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
	];
}

/** The address with embed=true, which shows the map without the page around it. */
export function embedUrl(url: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("embed", "true");
	return parsed.href;
}

/** The iframe that embeds the map. */
export function embedCode(url: string, width = 1260, height = 756): string {
	const src = embedUrl(url).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
	return `<iframe width="${width}" height="${height}" src="${src}" allow="clipboard-write"></iframe>`;
}

/** Only web addresses are offered as links. */
export function isWebUrl(url: string): boolean {
	try {
		return ["http:", "https:"].includes(new URL(url).protocol);
	} catch {
		return false;
	}
}
