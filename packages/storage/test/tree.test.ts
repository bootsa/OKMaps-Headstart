import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	atomicStorage,
	MapTree,
	memoryStorage,
	moveMap,
	prefixedStorage,
	solidStorage,
	treeStore,
	webdavStorage,
} from "../src/index.ts";
import { fileStorage } from "../src/node.ts";
import { fakeAtomic, fakeSolid, fakeWebdav } from "./fakes.ts";

const ORIGIN = "https://store.example";
const SEED = Buffer.from("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "hex").toString("base64");
const PUBLIC = Buffer.from("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "hex").toString(
	"base64",
);
const AGENT = { subject: `${ORIGIN}/agents/me`, privateKey: SEED };

const map = (id: string, created = "2026-11-01T10:00:00Z") => ({
	id,
	title: `map ${id}`,
	created,
	context: { service: "pubmed" },
	documents: [{}],
});

const adaptors = [
	["memory", () => memoryStorage()],
	["files", () => fileStorage(fs.mkdtempSync(path.join(os.tmpdir(), "okmaps-tree-")))],
	[
		"webdav",
		() => webdavStorage({ url: `${ORIGIN}/dav/`, username: "me", password: "secret", fetch: fakeWebdav(ORIGIN).fetch }),
	],
	["solid", () => solidStorage({ container: `${ORIGIN}/pod/okmaps`, fetch: fakeSolid(ORIGIN).fetch })],
	[
		"atomic",
		() =>
			atomicStorage({
				parent: `${ORIGIN}/drive/okmaps`,
				agent: AGENT,
				fetch: fakeAtomic(ORIGIN, { subject: AGENT.subject, publicKey: PUBLIC }).fetch,
			}),
	],
] as const;

describe.each(adaptors)("folders on %s storage", (_name, make) => {
	it("keeps maps in folders and subfolders, renames and removes them", async () => {
		const tree = new MapTree(make());
		await tree.save([], map("top"));
		expect(await tree.createFolder([], " Reading list ")).toBe("Reading list");
		await tree.createFolder([], "Archive");
		await tree.createFolder(["Reading list"], "2026");
		await tree.save(["Reading list"], map("a"));
		await tree.save(["Reading list", "2026"], map("b"));

		expect(await tree.list()).toMatchObject({ folders: ["Archive", "Reading list"], maps: [{ id: "top" }] });
		expect(await tree.list(["Reading list"])).toMatchObject({ folders: ["2026"], maps: [{ id: "a" }] });
		expect((await tree.get(["Reading list", "2026"], "b"))?.title).toBe("map b");

		await tree.renameFolder([], "Reading list", "Read");
		expect((await tree.list()).folders).toEqual(["Archive", "Read"]);
		expect((await tree.get(["Read", "2026"], "b"))?.title).toBe("map b");
		expect(await tree.get(["Reading list"], "a")).toBeUndefined();

		await tree.deleteFolder([], "Read");
		expect(await tree.list()).toMatchObject({ folders: ["Archive"], maps: [{ id: "top" }] });
		expect(await tree.list(["Read"])).toEqual({ folders: [], maps: [] });
	});
});

describe("MapTree", () => {
	it("keeps the top folder where maps were before folders", async () => {
		const storage = memoryStorage();
		await new MapTree(storage).save([], map("old"));
		expect(await storage.list("maps/")).toEqual(["maps/old.json"]);
	});

	it("refuses folder names that are not one path part", async () => {
		const tree = new MapTree(memoryStorage());
		for (const name of ["", "  ", "a/b", "..", "a\\b"]) await expect(tree.createFolder([], name)).rejects.toThrow();
		await tree.createFolder([], "a");
		await tree.createFolder([], "b");
		await expect(tree.renameFolder([], "a", "b")).rejects.toThrow(/already/);
	});

	it("sees a storage from inside a folder", async () => {
		const storage = memoryStorage();
		const inner = prefixedStorage(storage, "x/");
		await inner.put("maps/a.json", "1");
		expect(await storage.get("x/maps/a.json")).toBe("1");
		expect(await inner.list("maps/")).toEqual(["maps/a.json"]);
	});
});

describe("moveMap", () => {
	it("moves a map between stores and folders", async () => {
		const one = treeStore({ id: "1", name: "One", type: "memory" }, memoryStorage());
		const two = treeStore({ id: "2", name: "Two", type: "memory" }, memoryStorage(), { folders: false });
		await one.createFolder!([], "f");
		await one.save([], map("m"));
		await moveMap({ store: one, path: [] }, { store: one, path: ["f"] }, "m");
		expect((await one.list()).maps).toEqual([]);
		expect((await one.list(["f"])).maps.map((m) => m.id)).toEqual(["m"]);
		await moveMap({ store: one, path: ["f"] }, { store: two, path: [] }, "m");
		expect((await two.list()).maps.map((m) => m.id)).toEqual(["m"]);
		expect(await one.get(["f"], "m")).toBeUndefined();
		expect(two.createFolder).toBeUndefined();
		await expect(two.list(["f"])).rejects.toThrow(/no folders/);
	});
});
