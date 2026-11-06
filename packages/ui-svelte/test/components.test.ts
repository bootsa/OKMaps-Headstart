import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { createRawSnippet, flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { Button, Dialog, Tag } from "../src/index";

const text = (t: string) => createRawSnippet(() => ({ render: () => `<span>${t}</span>` }));

describe("Button", () => {
	it("renders a button with its variant and calls onclick", async () => {
		const onclick = vi.fn();
		render(Button, { variant: "secondary", onclick, children: text("Export") });
		const button = screen.getByRole("button", { name: "Export" });
		expect(button).toHaveClass("okm-button", "secondary", "md");
		expect(button).toHaveAttribute("type", "button");
		await userEvent.click(button);
		expect(onclick).toHaveBeenCalledOnce();
	});

	it("uses label as the accessible name of an icon-only button", () => {
		render(Button, { label: "Share", children: text("↗") });
		expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
	});

	it("renders a link when given href", () => {
		render(Button, { href: "https://example.org/", children: text("Open") });
		expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "https://example.org/");
	});

	it("does not fire when disabled", async () => {
		const onclick = vi.fn();
		render(Button, { disabled: true, onclick, children: text("Export") });
		await userEvent.click(screen.getByRole("button"));
		expect(onclick).not.toHaveBeenCalled();
	});
});

describe("Tag", () => {
	it("renders its tone", () => {
		render(Tag, { tone: "accent", children: text("Open access") });
		expect(screen.getByText("Open access").parentElement).toHaveClass("okm-tag", "accent");
	});
});

describe("Dialog", () => {
	it("opens when open is set and reports closing", async () => {
		const onclose = vi.fn();
		const { rerender } = render(Dialog, {
			title: "About",
			open: false,
			onclose,
			children: text("Body"),
		});
		const dialog = document.querySelector("dialog")!;
		expect(dialog.open).toBe(false);

		await rerender({ open: true });
		expect(dialog.open).toBe(true);
		expect(screen.getByRole("dialog", { name: "About" })).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "Close" }));
		flushSync();
		expect(dialog.open).toBe(false);
		expect(onclose).toHaveBeenCalledOnce();
	});

	it("does not render HTML in its title", async () => {
		render(Dialog, {
			title: "<img src=x onerror=alert(1)>",
			open: true,
			children: text("Body"),
		});
		expect(document.querySelector("dialog img")).toBeNull();
		expect(screen.getByRole("heading").textContent).toBe("<img src=x onerror=alert(1)>");
	});
});
