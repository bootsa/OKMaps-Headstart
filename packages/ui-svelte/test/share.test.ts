import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	embedCode,
	embedPlugin,
	embedUrl,
	faqsPlugin,
	MapState,
	registerPlugin,
	reloadPlugin,
	sharePlugin,
	shareTargets,
	unregisterPlugin,
	Visualization,
} from "../src/index";

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "base-map.json"), "utf8"));
const draw = () => {
	const state = new MapState(record, 600);
	render(Visualization, { state, height: 600 });
	return state;
};

afterEach(() => {
	for (const id of ["share", "embed", "faqs", "reload"]) unregisterPlugin(id);
	vi.useRealTimers();
});

describe("share and embed links", () => {
	it("encodes the address in each share link", () => {
		const [email, twitter, facebook] = shareTargets("https://e.org/map?a=1&b=2", "Sea & ice", "", "okmaps");
		expect(email.href).toBe("mailto:?subject=Sea%20%26%20ice&body=https%3A%2F%2Fe.org%2Fmap%3Fa%3D1%26b%3D2");
		expect(twitter.href).toContain(
			"url=https%3A%2F%2Fe.org%2Fmap%3Fa%3D1%26b%3D2&hashtags=okmaps&text=Sea%20%26%20ice",
		);
		expect(facebook.href).toBe(
			"https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fe.org%2Fmap%3Fa%3D1%26b%3D2",
		);
	});

	it("adds embed=true and escapes the iframe's address", () => {
		expect(embedUrl("https://e.org/map.html?id=1&embed=false")).toBe("https://e.org/map.html?id=1&embed=true");
		expect(embedCode('https://e.org/map.html?q="x"', 600, 400)).toBe(
			'<iframe width="600" height="400" src="https://e.org/map.html?q=%22x%22&amp;embed=true" allow="clipboard-write"></iframe>',
		);
	});
});

describe("share, embed and FAQs buttons", () => {
	it("makes the link when asked, then offers it with the share links", async () => {
		const link = vi.fn(async () => "https://e.org/map.html?shared=abc");
		registerPlugin(sharePlugin({ link }));
		draw();
		expect(link).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole("button", { name: "Share" }));
		await waitFor(() =>
			expect(screen.getByLabelText("Link to this map")).toHaveValue("https://e.org/map.html?shared=abc"),
		);
		expect(screen.getByRole("link", { name: "Facebook" })).toHaveAttribute(
			"href",
			"https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fe.org%2Fmap.html%3Fshared%3Dabc",
		);
	});

	it("refuses links that are not web addresses", async () => {
		registerPlugin(sharePlugin({ link: () => "javascript:alert(1)" }));
		draw();
		await fireEvent.click(screen.getByRole("button", { name: "Share" }));
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no web address"));
		expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
	});

	it("reports a link that could not be made", async () => {
		registerPlugin(
			sharePlugin({
				link: async () => {
					throw new Error("offline");
				},
			}),
		);
		draw();
		await fireEvent.click(screen.getByRole("button", { name: "Share" }));
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be shared: offline"));
	});

	it("shows the embed code and links to the FAQs", async () => {
		registerPlugin(embedPlugin({ link: () => "https://e.org/map.html?shared=abc", width: 800, height: 600 }));
		registerPlugin(faqsPlugin("https://e.org/faq"));
		draw();
		expect(screen.getByRole("link", { name: "FAQs" })).toHaveAttribute("href", "https://e.org/faq");
		await fireEvent.click(screen.getByRole("button", { name: "Embed" }));
		await waitFor(() =>
			expect(screen.getByRole("dialog").querySelector("pre")).toHaveTextContent(
				'<iframe width="800" height="600" src="https://e.org/map.html?shared=abc&amp;embed=true"',
			),
		);
	});
});

describe("reload notice", () => {
	it("appears once the check finds an update, and shrinks on 'Do it later'", async () => {
		vi.useFakeTimers();
		let changed = false;
		registerPlugin(reloadPlugin({ check: () => changed, interval: 1000 }));
		draw();
		await vi.advanceTimersByTimeAsync(1000);
		expect(screen.queryByRole("status")).toBeNull();
		changed = true;
		await vi.advanceTimersByTimeAsync(1000);
		flushSync();
		expect(screen.getByRole("button", { name: /update is available/ })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "Do it later" }));
		expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
	});
});
