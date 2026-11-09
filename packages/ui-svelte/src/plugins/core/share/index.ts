import { t } from "@okmaps/core";
import type { OkmPlugin } from "../../index";
import LinkModal from "./LinkModal.svelte";
import { type LinkMaker, type LinkRequest, pageLink } from "./links";

export interface ShareOptions {
	/** The address to share; by default this page's. An app can publish the map here. */
	link?: LinkMaker;
	/** Hashtags for X (Twitter), comma-separated. */
	hashtags?: string;
}

/** A "Share" button: the map's link to copy, and email, X and Facebook links. */
export function sharePlugin(options: ShareOptions = {}): OkmPlugin {
	const request: LinkRequest = { kind: "share", link: options.link ?? pageLink, hashtags: options.hashtags };
	return {
		id: "share",
		actions: [
			{
				id: "share",
				label: "Share",
				title: "Share this visualization",
				run: (map) => map.openModal("share", request),
			},
		],
		modals: { share: { title: () => "Share this map", component: LinkModal } },
	};
}

export interface EmbedOptions {
	/** The address to embed; by default this page's. */
	link?: LinkMaker;
	width?: number;
	height?: number;
}

/** An "Embed" button: the iframe code that shows the map on another site. */
export function embedPlugin(options: EmbedOptions = {}): OkmPlugin {
	const request: LinkRequest = {
		kind: "embed",
		link: options.link ?? pageLink,
		width: options.width,
		height: options.height,
	};
	return {
		id: "embed",
		actions: [
			{
				id: "embed",
				label: "Embed",
				title: "Embed this visualization on other websites",
				run: (map) => map.openModal("embed", request),
			},
		],
		modals: {
			embed: {
				title: (map) => {
					const title = t(map.strings, "embed_title");
					return title.charAt(0).toUpperCase() + title.slice(1);
				},
				component: LinkModal,
			},
		},
	};
}

/** An "FAQs" link to the deployment's questions page. */
export function faqsPlugin(url = "https://openknowledgemaps.org/faq"): OkmPlugin {
	return {
		id: "faqs",
		actions: [{ id: "faqs", label: "FAQs", title: "Check out our FAQs", href: () => url }],
	};
}
