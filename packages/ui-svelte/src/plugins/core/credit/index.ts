import type { OkmPlugin } from "../../index";
import { type LinkMaker, pageLink } from "../share/links";
import Credit from "./Credit.svelte";

export interface CreditOptions {
	/** Who made the map (default Open Knowledge Maps). */
	by?: { name: string; url: string };
	/** The FAQs page; none leaves the sentence out. */
	faqs?: string;
	/** Where "Create a knowledge map" goes (knowledge maps only); none hides it, e.g. when embedded. */
	create?: string;
	/** When the map was made; by default the map's last_update. */
	timestamp?: string;
	/** The map's own page (default this page); embed=true is taken off. */
	link?: LinkMaker;
}

/**
 * "This visualization was created by ..." at the bottom left of the map,
 * with a "Create a knowledge map" link (old Footer).
 */
export function creditPlugin(options: CreditOptions = {}): OkmPlugin {
	return {
		id: "credit",
		overlays: [
			{
				component: Credit,
				props: {
					by: options.by ?? { name: "Open Knowledge Maps", url: "https://openknowledgemaps.org" },
					faqs: options.faqs,
					create: options.create,
					timestamp: options.timestamp,
					link: options.link ?? pageLink,
				},
			},
		],
	};
}
