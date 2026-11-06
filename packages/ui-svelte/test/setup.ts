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
