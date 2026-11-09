import { demoSource, endpointSourceType, gatewaySource } from "@okmaps/core/testing";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AppSettings,
	registerSource,
	registerSourceType,
	SearchForm,
	type SearchSubmit,
	unregisterSource,
	unregisterSourceType,
} from "../src/index";

const other = { ...demoSource, id: "other", label: "Other library", views: ["overview"] };

beforeEach(() => {
	registerSource(demoSource);
	registerSource(gatewaySource);
	registerSource(other);
	registerSourceType(endpointSourceType);
});
afterEach(() => {
	unregisterSourceType("endpoint");
	for (const id of ["demo", "gated", "other"]) unregisterSource(id);
});

const settingsWith = () =>
	new AppSettings({
		storage: null,
		seed: () => ({
			stores: [
				{ id: "b", type: "memory", name: "This browser", config: {} },
				{ id: "c", type: "memory", name: "Cloud", config: {} },
			],
		}),
	});

describe("search form", () => {
	it("offers only the enabled sources this site can use, and the map types of the chosen one", async () => {
		const settings = settingsWith();
		settings.setSourceEnabled("other", false);
		render(SearchForm, { settings, onsearch: async () => {} });
		expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["demo"]);
		expect(screen.getByLabelText("Map type")).toBeInTheDocument();
		expect(screen.getByLabelText("Search terms")).toBeRequired();
	});

	it("hands over the request, the view and where to keep the map, or don't save", async () => {
		const settings = settingsWith();
		const onsearch = vi.fn(async (s: SearchSubmit) => s.progress("Searching…"));
		render(SearchForm, { settings, onsearch });
		await fireEvent.click(screen.getByRole("button", { name: "Make map" }));
		expect(screen.getByRole("status")).toHaveTextContent("Please fill in: Search terms.");
		await fireEvent.input(screen.getByLabelText("Search terms"), { target: { value: "sea ice" } });
		await fireEvent.change(screen.getByLabelText("Map type"), { target: { value: "timeline" } });
		await fireEvent.change(screen.getByLabelText("Keep the map in"), { target: { value: '["c"]' } });
		await fireEvent.click(screen.getByRole("button", { name: "Make map" }));
		await waitFor(() => expect(onsearch).toHaveBeenCalledTimes(1));
		expect(onsearch.mock.calls[0][0]).toMatchObject({
			request: { service: "demo", q: "sea ice", vis_type: "timeline" },
			view: "timeline",
			title: "sea ice",
			saveTo: { store: "c", path: [] },
		});
		expect(settings.saveTo).toEqual({ store: "c", path: [] });

		await fireEvent.change(screen.getByLabelText("Keep the map in"), { target: { value: "none" } });
		await fireEvent.click(screen.getByRole("button", { name: "Make map" }));
		await waitFor(() => expect(onsearch).toHaveBeenCalledTimes(2));
		expect(onsearch.mock.calls[1][0].saveTo).toBe("none");
	});

	it("shows why a map could not be made", async () => {
		render(SearchForm, {
			settings: settingsWith(),
			onsearch: async () => {
				throw new Error("There are not enough results.");
			},
		});
		await fireEvent.input(screen.getByLabelText("Search terms"), { target: { value: "x" } });
		await fireEvent.click(screen.getByRole("button", { name: "Make map" }));
		await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("There are not enough results."));
	});
});

it("offers the person's own sources and hands over their request", async () => {
	const settings = settingsWith();
	settings.putSource({
		id: "w",
		type: "endpoint",
		name: "My wiki",
		config: { endpoint: "https://w/", query: "{{q}}" },
	});
	const onsearch = vi.fn(async (_s: SearchSubmit) => {});
	render(SearchForm, { settings, onsearch });
	await fireEvent.click(screen.getByRole("radio", { name: "My wiki" }));
	await fireEvent.input(screen.getByLabelText("Search terms"), { target: { value: "coral" } });
	await fireEvent.click(screen.getByRole("button", { name: "Make map" }));
	await waitFor(() => expect(onsearch).toHaveBeenCalledTimes(1));
	expect(onsearch.mock.calls[0][0]).toMatchObject({
		request: { service: "endpoint", q: "coral", config: { endpoint: "https://w/" } },
		title: "coral",
	});
});

describe("several sources", () => {
	it("offers Several sources with combine, and hands over the picked sources' requests", async () => {
		const settings = settingsWith();
		const onsearch = vi.fn(async (_s: SearchSubmit) => {});
		const combine = (parts: { source: { id: string }; request: unknown }[], q: string, view: string) => ({
			service: "combined",
			q,
			view,
			parts: parts.map((p) => p.request),
		});
		render(SearchForm, { settings, onsearch, combine });
		await fireEvent.click(screen.getByRole("radio", { name: "Several sources" }));
		await fireEvent.input(screen.getByLabelText("Search terms"), { target: { value: "sea ice" } });
		expect(screen.getByRole("checkbox", { name: "Demo library" })).toBeChecked();
		await fireEvent.click(screen.getByRole("checkbox", { name: "Other library" }));
		await fireEvent.click(screen.getByRole("button", { name: "Make map" }));
		expect(screen.getByRole("status")).toHaveTextContent("Please pick at least two sources.");
		await fireEvent.click(screen.getByRole("checkbox", { name: "Other library" }));
		await fireEvent.click(screen.getByRole("button", { name: "Make map" }));
		await waitFor(() => expect(onsearch).toHaveBeenCalledTimes(1));
		expect(onsearch.mock.calls[0][0]).toMatchObject({
			request: {
				service: "combined",
				q: "sea ice",
				view: "overview",
				parts: [
					{ service: "demo", q: "sea ice" },
					{ service: "demo", q: "sea ice" },
				],
			},
			title: "sea ice",
		});
	});

	it("offers no Several sources without combine", () => {
		render(SearchForm, { settings: settingsWith(), onsearch: async () => {} });
		expect(screen.queryByRole("radio", { name: "Several sources" })).toBeNull();
	});
});
