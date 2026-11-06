/**
 * Keeps published maps as files (<dir>/<id>.json), for the Node server.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { MapStore } from "./maps.ts";

export function fileStore(dir: string): MapStore {
  const file = (id: string) => path.join(dir, `${id}.json`);
  let ready: Promise<unknown> | null = null;
  return {
    get: async (id) => {
      try {
        return await fs.readFile(file(id), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    put: async (id, body) => {
      ready ??= fs.mkdir(dir, { recursive: true });
      await ready;
      // Write to a temporary file and rename, so a reader never sees half a map.
      const tmp = `${file(id)}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, body, "utf8");
      await fs.rename(tmp, file(id));
    },
  };
}
