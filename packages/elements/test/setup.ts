export {};

// jsdom has <dialog> but not its methods.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
	this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement, value?: string) {
	if (value !== undefined) this.returnValue = value;
	this.open = false;
	this.dispatchEvent(new Event("close"));
};

// jsdom has no matchMedia; svelte/motion reads prefers-reduced-motion with it.
if (typeof window !== "undefined" && !window.matchMedia) {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
}

// jsdom has no ResizeObserver; Svelte's bind:clientWidth uses it.
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

// Every view and the core plugins, as the bundle registers them.
// Imported after the stubs above: the views load svelte/motion.
const { registerCorePlugins, registerCoreViews } = await import("../src/index");
registerCoreViews();
registerCorePlugins();
