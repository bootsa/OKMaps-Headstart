/**
 * State any UI framework can follow, or none: a set of named fields, a
 * listener per change, and a hook on every read.
 *
 * - Read fields through getters (`read`), change them only through
 *   setters and methods (`write`); a write of the same value is ignored.
 * - `subscribe(listener)` is called with the name of each field that
 *   changed. That fits React's useSyncExternalStore, Vue's shallowRef, a
 *   web component's re-render, or plain callbacks.
 * - `observe(field)` runs on every read. It does nothing here; a UI layer
 *   overrides it to track what its components read (ui-svelte does this
 *   with one Svelte subscriber per field, so a change re-runs only what
 *   read that field).
 * - `memo` caches a value worked out from fields (the list's papers) until
 *   one of them changes; reading it reads (and so tracks) those fields.
 */
export abstract class Observable<S extends object> {
	#state: S;
	readonly #listeners = new Set<(field: keyof S) => void>();
	readonly #memos = new Map<string, { inputs: unknown[]; value: unknown }>();

	constructor(initial: S) {
		this.#state = { ...initial };
	}

	/** Called with the field's name on every read; a UI layer hooks its reactivity in here. */
	protected observe(_field: keyof S): void {}

	/** Calls `listener` with the name of each field that changes; returns a function that stops it. */
	subscribe(listener: (field: keyof S) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	protected read<K extends keyof S>(field: K): S[K] {
		this.observe(field);
		return this.#state[field];
	}

	/** Reads without telling observe (for the class's own bookkeeping). */
	protected peek<K extends keyof S>(field: K): S[K] {
		return this.#state[field];
	}

	protected write<K extends keyof S>(field: K, value: S[K]): void {
		if (Object.is(this.#state[field], value)) return;
		this.#state[field] = value;
		for (const l of [...this.#listeners]) l(field);
	}

	/** A value worked out from `fields`, kept until one of them changes. */
	protected memo<T>(name: string, fields: (keyof S)[], compute: () => T): T {
		const inputs = fields.map((f) => this.read(f));
		const cached = this.#memos.get(name);
		if (cached?.inputs.every((v, i) => Object.is(v, inputs[i]))) return cached.value as T;
		const value = compute();
		this.#memos.set(name, { inputs, value });
		return value;
	}
}
