import { memoryStorage, treeStore } from "@okmaps/storage";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { AppSettings, ExplorerState, MAP_TYPE, MapExplorer, type StoreInstance } from "../src/index";

const map = (id: string, title = `Map ${id}`) => ({
	id,
	title,
	created: "2026-11-07T10:00:00Z",
	context: { service: "pubmed" },
	documents: [{}],
});

async function setup() {
	const stores = {
		a: treeStore({ id: "a", name: "Browser", type: "memory" }, memoryStorage()),
		b: treeStore({ id: "b", name: "Flat", type: "flat" }, memoryStorage(), { folders: false }),
	};
	await stores.a.save([], map("one", "Sea ice"));
	await stores.a.createFolder!([], "Reading");
	await stores.a.save(["Reading"], map("two", "Coral reefs"));
	const instances: StoreInstance[] = [
		{ id: "a", type: "memory", name: "Browser", config: {} },
		{ id: "b", type: "flat", name: "Flat", config: {} },
	];
	const settings = new AppSettings({ storage: null, seed: () => ({ stores: instances }) });
	const explorer = new ExplorerState(settings, async (s) => stores[s.id as "a" | "b"]);
	render(MapExplorer, {
		settings,
		explorer,
		mapHref: (s: string, p: readonly string[], id: string) => `map.html?store=${s}&path=${p.join("/")}&id=${id}`,
	});
	await screen.findByText("Sea ice");
	return { stores, explorer };
}

// The test registers no store types: "memory" and "flat" are unknown, so register them.
import { registerStoreType } from "../src/index";

registerStoreType({ type: "memory", label: "Memory", fields: [], folders: true, open: async () => Promise.reject() });
registerStoreType({ type: "flat", label: "Flat", fields: [], folders: false, open: async () => Promise.reject() });

describe("map explorer", () => {
	it("opens the default store and its folders like an accordion, with links to the maps", async () => {
		await setup();
		expect(screen.getByRole("link", { name: /Sea ice/ })).toHaveAttribute("href", "map.html?store=a&path=&id=one");
		await fireEvent.click(screen.getByRole("button", { name: "Reading" }));
		expect(await screen.findByRole("link", { name: /Coral reefs/ })).toHaveAttribute(
			"href",
			"map.html?store=a&path=Reading&id=two",
		);
		const flat = screen.getByRole("button", { name: "Flat" });
		expect(flat).toHaveAttribute("aria-expanded", "false");
		await fireEvent.click(flat);
		expect(await screen.findByText("No maps yet.")).toBeInTheDocument();
		// The top folder and Reading offer New folder; the store without folders does not.
		expect(screen.getAllByRole("button", { name: "+ New folder" })).toHaveLength(2);
	});

	it("makes, renames and deletes folders", async () => {
		const { stores } = await setup();
		await fireEvent.click(screen.getByRole("button", { name: "+ New folder" }));
		await fireEvent.input(screen.getByPlaceholderText("Folder name"), { target: { value: "Later" } });
		await fireEvent.click(screen.getByRole("button", { name: "Make" }));
		await screen.findByRole("button", { name: "Later" });
		expect((await stores.a.list()).folders).toEqual(["Later", "Reading"]);

		await fireEvent.click(screen.getByRole("button", { name: "Rename folder Later" }));
		await fireEvent.input(screen.getByLabelText("New name for Later"), { target: { value: "Someday" } });
		await fireEvent.click(screen.getByRole("button", { name: "Rename" }));
		await screen.findByRole("button", { name: "Someday" });

		await fireEvent.click(screen.getByRole("button", { name: "Delete folder Reading" }));
		await fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Reading" })).not.toBeInTheDocument());
		expect((await stores.a.list()).folders).toEqual(["Someday"]);
		expect(await stores.a.get(["Reading"], "two")).toBeUndefined();
	});

	it("deletes a map after asking", async () => {
		const { stores } = await setup();
		await fireEvent.click(screen.getByRole("button", { name: "Delete map Sea ice" }));
		await fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(screen.queryByText("Sea ice")).not.toBeInTheDocument());
		expect((await stores.a.list()).maps).toEqual([]);
		expect(screen.getByRole("status")).toHaveTextContent("Sea ice deleted.");
	});

	it("moves a map to another store with Move", async () => {
		const { stores } = await setup();
		await fireEvent.click(screen.getByRole("button", { name: "Move map Sea ice" }));
		await fireEvent.click(await screen.findByRole("radio", { name: /Flat/ }));
		await fireEvent.click(screen.getByRole("button", { name: "Move" }));
		await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sea ice moved to Flat."));
		expect((await stores.b.list()).maps.map((m) => m.id)).toEqual(["one"]);
		expect((await stores.a.list()).maps).toEqual([]);
	});

	it("moves a map into a folder by dragging it there", async () => {
		const { stores } = await setup();
		const data = new Map<string, string>();
		const dataTransfer = {
			setData: (t: string, v: string) => data.set(t, v),
			getData: (t: string) => data.get(t) ?? "",
			get types() {
				return [...data.keys()];
			},
			effectAllowed: "",
			dropEffect: "",
		};
		await fireEvent.dragStart(screen.getByRole("link", { name: /Sea ice/ }), { dataTransfer });
		expect(data.has(MAP_TYPE)).toBe(true);
		const folderRow = screen.getByRole("button", { name: "Reading" }).parentElement!;
		await fireEvent.dragOver(folderRow, { dataTransfer });
		await fireEvent.drop(folderRow, { dataTransfer });
		await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sea ice moved to Browser / Reading."));
		expect((await stores.a.list(["Reading"])).maps.map((m) => m.id).sort()).toEqual(["one", "two"]);
	});

	it("exports a store's maps to a file and imports the file into another store", async () => {
		const { stores, explorer } = await setup();
		const file = await explorer.exportMaps("a");
		expect(file?.name).toMatch(/^okmaps-browser-\d{4}-\d{2}-\d{2}\.json$/);
		expect(JSON.parse(file?.text ?? "").maps.map((e: { path: string[] }) => e.path)).toEqual([[], ["Reading"]]);

		await fireEvent.click(screen.getByRole("button", { name: "Flat" }));
		await screen.findByText("No maps yet.");
		const input = screen.getByLabelText("Import maps into Flat") as HTMLInputElement;
		await fireEvent.change(input, {
			target: { files: [new File([file?.text ?? ""], "maps.json", { type: "application/json" })] },
		});
		await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 maps imported into Flat."));
		// Flat has no folders: both maps land at its top.
		expect((await stores.b.list()).maps.map((m) => m.id).sort()).toEqual(["one", "two"]);
		expect(screen.getAllByText("Coral reefs").length).toBeGreaterThan(0);
	});

	it("says what is wrong with a file it cannot import", async () => {
		await setup();
		const input = screen.getByLabelText("Import maps into Browser") as HTMLInputElement;
		await fireEvent.change(input, { target: { files: [new File(["{}"], "x.json")] } });
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				"Importing the maps did not work: the file is neither a maps file nor a map.",
			),
		);
	});
});
