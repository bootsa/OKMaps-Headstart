import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AppSettings,
	defaultValues,
	missingFields,
	registerSource,
	registerStoreType,
	SettingsPage,
	textValues,
	unregisterSource,
	unregisterStoreType,
} from "../src/index";
import { davLikeStoreType, demoSource, gatewaySource, memoryStoreType } from "../src/settings/testing/fakes";

const memory = () => {
	const data = new Map<string, string>();
	return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

beforeEach(() => {
	registerStoreType(memoryStoreType);
	registerStoreType(davLikeStoreType);
	registerSource(demoSource);
	registerSource(gatewaySource);
});
afterEach(() => {
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

describe("settings page", () => {
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
