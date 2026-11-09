/**
 * Svelte reactivity for @okmaps/core's Observable state: one subscriber per
 * object and field, so an effect that read `zoomedArea` re-runs when
 * zoomedArea changes, and not when the pointer moves over a paper.
 */
import { createSubscriber } from "svelte/reactivity";

interface Subscribable {
	subscribe(listener: (field: PropertyKey) => void): () => void;
}

const trackers = new WeakMap<Subscribable, Map<PropertyKey, () => void>>();

/** Call from an Observable's observe(field): tracks the read in the running effect, if any. */
export function track(source: Subscribable, field: PropertyKey): void {
	let fields = trackers.get(source);
	if (!fields) {
		fields = new Map();
		trackers.set(source, fields);
	}
	let tracker = fields.get(field);
	if (!tracker) {
		tracker = createSubscriber((update) => source.subscribe((changed) => changed === field && update()));
		fields.set(field, tracker);
	}
	tracker();
}
