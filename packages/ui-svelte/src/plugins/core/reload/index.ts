import type { MapState } from "../../../data/state.svelte";
import type { OkmPlugin } from "../../index";
import ReloadNotice from "./ReloadNotice.svelte";

export interface ReloadOptions {
	/** True when newer data is available (e.g. the source sheet changed). */
	check: (map: MapState) => boolean | Promise<boolean>;
	/** How often to check, in ms (default one minute). */
	interval?: number;
}

/** Offers a reload when the map's data has changed. */
export function reloadPlugin(options: ReloadOptions): OkmPlugin {
	return {
		id: "reload",
		overlays: [{ component: ReloadNotice, props: { check: options.check, interval: options.interval ?? 60_000 } }],
	};
}
