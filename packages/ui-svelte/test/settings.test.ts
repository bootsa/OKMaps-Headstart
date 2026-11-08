import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AppSettings,
	allSources,
	defaultValues,
	missingFields,
	registerSource,
	registerSourceType,
	registerStoreType,
	SettingsPage,
	textValues,
	unregisterSource,
	unregisterSourceType,
	unregisterStoreType,
} from "../src/index";
import {
	davLikeStoreType,
	demoSource,
	endpointSourceType,
	gatewaySource,
	memoryStoreType,
} from "../src/settings/testing/fakes";

const memory = () => {
	const data = new Map<string, string>();
	return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

beforeEach(() => {
	registerStoreType(memoryStoreType);
	registerStoreType(davLikeStoreType);
	registerSource(demoSource);
	registerSource(gatewaySource);
	registerSourceType(endpointSourceType);
});
afterEach(() => {
	unregisterSourceType("endpoint");
	unregisterStoreType("memory");
	unregisterStoreType("dav");
	unregisterSource("demo");
	unregisterSource("gated");
});

describe("fields", () => {
	it("fills defaults and finds missing required fields", () => {
		const fields = davLikeStoreType.fields;
		const values = defaultValues(fields, { username: "me" });
		expect(values).toEqual({ url: "", username: "me", password: "" });
		expect(missingFields(fields, values)).toEqual(["Folder URL"]);
		const boxes = [{ name: "b", label: "B", kind: "checkboxes" as const, options: [] }];
		expect(defaultValues(boxes, { b: "on,off" })).toEqual({ b: ["on", "off"] });
		expect(textValues(boxes, defaultValues(boxes, { b: "" }))).toEqual({ b: "" });
		expect(textValues(fields, { url: " https://x/ ", username: "me", password: " p " })).toEqual({
			url: "https://x/",
			username: "me",
			password: " p ",
		});
	});
});

describe("AppSettings", () => {
	it("starts from the seed, then keeps what is saved", () => {
		const storage = memory();
		const seed = () => ({ stores: [{ id: "b", type: "memory", name: "This browser", config: {} }] });
		const one = new AppSettings({ storage, seed });
		expect(one.saveTo).toEqual({ store: "b", path: [] });
		one.setSourceEnabled("demo", false);
		one.putStore({ id: "d", type: "dav", name: "Cloud", config: { url: "https://c/" } });
		one.setSaveTo({ store: "d", path: ["Reading"] });

		const two = new AppSettings({ storage, seed: () => ({ stores: [] }) });
		expect(two.sourceEnabled("demo")).toBe(false);
		expect(two.sourceEnabled("new")).toBe(true);
		expect(two.stores.map((s) => s.name)).toEqual(["This browser", "Cloud"]);
		expect(two.saveTo).toEqual({ store: "d", path: ["Reading"] });

		two.removeStore("d");
		expect(two.saveTo).toEqual({ store: "b", path: [] });
		two.moveStore("b", 1);
		two.setSaveTo("none");
		expect(new AppSettings({ storage }).saveTo).toBe("none");
	});

	it("ignores settings it cannot read", () => {
		const storage = memory();
		storage.setItem("okmaps-settings", "{nope");
		expect(new AppSettings({ storage }).stores).toEqual([]);
	});
});

describe("own sources", () => {
	it("are kept with the settings and become sources after the site's", () => {
		const storage = memory();
		const one = new AppSettings({ storage });
		one.putSource({ id: "w1", type: "endpoint", name: "My wiki", config: { endpoint: "https://w/", query: "{{q}}" } });
		one.putSource({ id: "x", type: "gone", name: "Old type", config: {} });
		one.setSourceEnabled("endpoint:w1", false);

		const two = new AppSettings({ storage });
		expect(two.sources.map((s) => s.name)).toEqual(["My wiki", "Old type"]);
		expect(two.sourceEnabled("endpoint:w1")).toBe(false);
		const all = allSources(two.sources);
		expect(all.map((s) => s.id)).toEqual(["demo", "gated", "endpoint:w1"]);
		expect(all[2]).toMatchObject({ label: "My wiki", description: "https://w/" });
		expect(all[2].request({ q: "x" }, "overview")).toMatchObject({ config: { endpoint: "https://w/" } });

		two.removeSource("w1");
		expect(two.disabledSources).toEqual([]);
		expect(new AppSettings({ storage }).sources.map((s) => s.id)).toEqual(["x"]);
	});

	it("reads settings saved before there were own sources", () => {
		const storage = memory();
		storage.setItem("okmaps-settings", JSON.stringify({ version: 1, disabledSources: [], stores: [], saveTo: "none" }));
		expect(new AppSettings({ storage }).sources).toEqual([]);
	});
});

describe("settings page", () => {
	it("adds a source from a preset, edits it and removes it", async () => {
		const settings = new AppSettings({ storage: memory() });
		render(SettingsPage, { settings });
		expect(screen.getByText(/None yet/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "Add a source" }));
		// The first preset fills the fields.
		expect(screen.getByLabelText("Start from")).toHaveValue("wiki");
		expect(screen.getByLabelText("Endpoint")).toHaveValue("https://wiki.example/sparql");
		expect(screen.getByText("Searches the wiki.")).toBeInTheDocument();
		await fireEvent.change(screen.getByLabelText("Start from"), { target: { value: "other" } });
		expect(screen.getByLabelText("Endpoint")).toHaveValue("https://other.example/sparql");
		await fireEvent.change(screen.getByLabelText("Start from"), { target: { value: "wiki" } });
		await fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
		await waitFor(() => expect(settings.sources).toHaveLength(1));
		expect(settings.sources[0]).toMatchObject({
			type: "endpoint",
			name: "Wiki",
			config: { endpoint: "https://wiki.example/sparql", query: 'SELECT * { "{{q}}" }', title: "" },
		});
		expect(screen.getByText(/Wiki was added/)).toBeInTheDocument();
		const box = screen.getByRole("checkbox", { name: /Wiki/ });
		expect(box).toBeChecked();
		await fireEvent.click(box);
		expect(settings.sourceEnabled(`endpoint:${settings.sources[0].id}`)).toBe(false);

		// The type's check keeps a broken query from being saved.
		await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		expect(screen.getByLabelText("Start again from")).toHaveValue("");
		await fireEvent.input(screen.getByLabelText("Query"), { target: { value: "SELECT nothing" } });
		await fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
		await waitFor(() => expect(screen.getByText("The query must use {{q}}.")).toBeInTheDocument());
		expect(settings.sources[0].config.query).toBe('SELECT * { "{{q}}" }');
		await fireEvent.input(screen.getByLabelText("Query"), { target: { value: "ASK {{q}}" } });
		await fireEvent.input(screen.getByLabelText("Name", { selector: "#okm-source-name" }), {
			target: { value: "Renamed" },
		});
		await fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
		await waitFor(() => expect(settings.sources[0].name).toBe("Renamed"));
		expect(settings.sources[0].config.query).toBe("ASK {{q}}");

		await fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
		await fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Remove" }));
		expect(settings.sources).toEqual([]);
		expect(screen.getByText(/Maps made with it were not deleted/)).toBeInTheDocument();
	});

	it("starts an own source empty when asked, and folds the mapping away", async () => {
		const settings = new AppSettings({ storage: memory() });
		render(SettingsPage, { settings });
		await fireEvent.click(screen.getByRole("button", { name: "Add a source" }));
		await fireEvent.change(screen.getByLabelText("Start from"), { target: { value: "" } });
		expect(screen.getByLabelText("Endpoint")).toHaveValue("");
		expect(screen.getByText("Field mapping").closest("details")).not.toHaveAttribute("open");
		await fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
		expect(screen.getByText("Please fill in: Endpoint, Query.")).toBeInTheDocument();
	});

	it("loads a select's options from the other fields, and again when they change", async () => {
		const loads: string[] = [];
		registerSourceType({
			type: "shelf",
			label: "A shelf",
			fields: [
				{ name: "owner", label: "Owner", kind: "text" },
				{
					name: "box",
					label: "Box",
					kind: "select",
					options: [{ value: "", label: "Every box" }],
					dependsOn: ["owner"],
					loadOptions: async (v) => {
						const owner = String(v.owner ?? "");
						loads.push(owner);
						if (owner === "nobody") throw new Error("Nobody has boxes.");
						return [
							{ value: "", label: "Every box" },
							{ value: `${owner}-1`, label: `${owner || "public"} box 1` },
						];
					},
				},
			],
			module: () => ({ fields: [], request: () => ({}), title: () => "" }),
		});
		try {
			const settings = new AppSettings({ storage: memory() });
			render(SettingsPage, { settings });
			await fireEvent.click(screen.getByRole("button", { name: "Add a source" }));
			await fireEvent.click(screen.getByRole("radio", { name: /A shelf/ }));
			await waitFor(() => expect(screen.getByRole("option", { name: "public box 1" })).toBeInTheDocument());
			await fireEvent.change(screen.getByLabelText("Box"), { target: { value: "-1" } });
			await fireEvent.input(screen.getByLabelText(/Owner/), { target: { value: "ann" } });
			await waitFor(() => expect(screen.getByRole("option", { name: "ann box 1" })).toBeInTheDocument());
			// The old library's box is gone, so the first option is picked.
			expect(screen.getByLabelText("Box")).toHaveValue("");
			expect(loads).toEqual(["", "ann"]);
			await fireEvent.input(screen.getByLabelText(/Owner/), { target: { value: "nobody" } });
			await waitFor(() => expect(screen.getByText("Nobody has boxes.")).toBeInTheDocument());
			await fireEvent.click(screen.getByRole("button", { name: "Load box again" }));
			expect(loads.at(-1)).toBe("nobody");
		} finally {
			unregisterSourceType("shelf");
		}
	});

	it("switches sources on and off, but not ones this site cannot use", async () => {
		const settings = new AppSettings({ storage: memory() });
		render(SettingsPage, { settings });
		const demo = screen.getByRole("checkbox", { name: /Demo library/ });
		expect(demo).toBeChecked();
		await fireEvent.click(demo);
		expect(settings.sourceEnabled("demo")).toBe(false);
		const gated = screen.getByRole("checkbox", { name: /Gated library/ });
		expect(gated).toBeDisabled();
		expect(screen.getByText(/Not available here: needs a gateway/)).toBeInTheDocument();
	});

	it("adds two stores of one type with their own names, and refuses one that does not connect", async () => {
		const settings = new AppSettings({ storage: memory() });
		render(SettingsPage, { settings });
		const addStore = async (name: string, url: string) => {
			await fireEvent.click(screen.getByRole("button", { name: "Add a place to keep maps" }));
			await fireEvent.click(screen.getByRole("radio", { name: /A WebDAV folder/ }));
			await fireEvent.input(screen.getByLabelText("Name"), { target: { value: name } });
			await fireEvent.input(screen.getByLabelText("Folder URL"), { target: { value: url } });
			await fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
		};
		await addStore("Work cloud", "https://work.example/dav/");
		await waitFor(() => expect(screen.getByText("Work cloud was added.")).toBeInTheDocument());
		await addStore("", "https://home.example/dav/");
		await waitFor(() => expect(settings.stores).toHaveLength(2));
		expect(settings.stores.map((s) => s.name)).toEqual(["Work cloud", "home.example"]);
		expect(settings.saveTo).toEqual({ store: settings.stores[0].id, path: [] });

		await addStore("Bad", "http://insecure.example/");
		await waitFor(() => expect(screen.getByText(/the URL must start with https/)).toBeInTheDocument());
		expect(settings.stores).toHaveLength(2);
	});

	it("makes a store the default and removes one without deleting its maps", async () => {
		const settings = new AppSettings({
			storage: memory(),
			seed: () => ({
				stores: [
					{ id: "a", type: "memory", name: "Scratch", config: {} },
					{ id: "b", type: "memory", name: "Other", config: {} },
				],
			}),
		});
		render(SettingsPage, { settings });
		await fireEvent.click(screen.getByRole("button", { name: "Make default" }));
		expect(settings.saveTo).toEqual({ store: "b", path: [] });
		await fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
		await fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Remove" }));
		expect(settings.stores.map((s) => s.name)).toEqual(["Other"]);
		expect(screen.getByText(/The maps in it were not deleted/)).toBeInTheDocument();
	});
});
