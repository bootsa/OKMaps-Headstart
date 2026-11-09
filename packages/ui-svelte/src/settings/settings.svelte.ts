/**
 * The person's settings (@okmaps/core's AppSettings) made reactive for
 * Svelte: components that read a field update when the settings change.
 */
import { AppSettings as CoreSettings } from "@okmaps/core";
import { createSubscriber } from "svelte/reactivity";

export class AppSettings extends CoreSettings {
	readonly #track = createSubscriber((update) => this.subscribe(update));

	protected override observe(): void {
		this.#track();
	}
}
