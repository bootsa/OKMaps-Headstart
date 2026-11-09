/**
 * The map explorer's state (@okmaps/core's ExplorerState) made reactive for Svelte.
 */
import { ExplorerState as CoreExplorerState, type ExplorerFields } from "@okmaps/core";
import { track } from "../data/reactive";

export { type Listing, type MapRef, placeKey } from "@okmaps/core";

export class ExplorerState extends CoreExplorerState {
	protected override observe(field: keyof ExplorerFields): void {
		track(this, field);
	}
}
