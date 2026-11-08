/** Registers the kinds of store this build offers (virtual:okmaps/stores). */

import { storeTypes } from "virtual:okmaps/stores";
import { registerStoreType } from "@okmaps/ui-svelte";

let done = false;

export function registerAppStoreTypes(): void {
	if (done) return;
	done = true;
	for (const t of storeTypes) registerStoreType(t);
}
