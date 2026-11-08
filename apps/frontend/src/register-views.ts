/** Registers the map views and plugins this build has (virtual:okmaps/views). */

import { plugins, views } from "virtual:okmaps/views";
import { registerPlugin, registerView } from "@okmaps/ui-svelte";

let done = false;

export function registerAppViews(): void {
	if (done) return;
	done = true;
	for (const v of views) registerView(v);
	for (const p of plugins) registerPlugin(p);
}
