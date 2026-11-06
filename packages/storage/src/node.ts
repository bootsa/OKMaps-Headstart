/** Node-only storage: files in a folder (the gateway's MAPS_DIR). */
import fs from "node:fs/promises";
import path from "node:path";
import { checkKey, checkPrefix, type MapStorage } from "./types.ts";

export function fileStorage(dir: string): MapStorage {
  const root = path.resolve(dir);
  const file = (key: string) => path.join(root, ...checkKey(key).split("/"));
  return {
    label: `folder (${root})`,
    async get(key) {
      try {
        return await fs.readFile(file(key), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async put(key, body) {
      const target = file(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      // Write then rename, so a reader never sees half a document.
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, body, "utf8");
      await fs.rename(tmp, target);
    },
    async delete(key) {
      await fs.rm(file(key), { force: true });
    },
    async list(prefix = "") {
      const folder = path.join(root, ...checkPrefix(prefix).split("/").filter(Boolean));
      try {
        const entries = await fs.readdir(folder, { withFileTypes: true });
        return entries.filter((e) => e.isFile() && !e.name.endsWith(".tmp")).map((e) => prefix + e.name).sort();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
    },
  };
}

export * from "./index.ts";
