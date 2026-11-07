// Extend this package's own expect: "@testing-library/jest-dom/vitest"
// imports whichever vitest pnpm hoists, which in CI is the workspace's v3.
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

expect.extend(matchers);

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

// Every view this package ships (the app registers the ones it draws).
// Imported after the stubs above: the views load svelte/motion.
const { registerCoreViews } = await import("../src/views/core");
registerCoreViews();
