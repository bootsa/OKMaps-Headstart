/**
 * Writes dist/sw.js after the build: the service worker in sw/sw.js with
 * the files to store at install and a version made from their contents.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Files stored at install, relative to the site root. */
export function precacheList(outDir: string): string[] {
  const list = (dir: string) =>
    fs.existsSync(path.join(outDir, dir))
      ? fs.readdirSync(path.join(outDir, dir)).filter((f) => !f.endsWith(".map")).map((f) => `${dir}/${f}`)
      : [];
  const files = ["index.html", "map.html", "manifest.webmanifest", ...list("assets"), ...list("icons")];
  const tagsFile = path.join(outDir, "vis/tags.json");
  if (fs.existsSync(tagsFile)) {
    const tags = JSON.parse(fs.readFileSync(tagsFile, "utf8")) as { scripts: string[]; styles: string[] };
    files.push("vis/tags.json", ...[...tags.styles, ...tags.scripts].map((f) => `vis/${f}`));
  }
  return files.filter((f) => fs.existsSync(path.join(outDir, f)));
}

export function serviceWorker(source: string): Plugin {
  let outDir = "dist";
  return {
    name: "okmaps-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = precacheList(outDir);
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(fs.readFileSync(path.join(outDir, f)));
      const version = hash.digest("hex").slice(0, 16);
      const sw = fs
        .readFileSync(source, "utf8")
        .replace('"__VERSION__"', JSON.stringify(version))
        .replace("__PRECACHE__", JSON.stringify(files));
      fs.writeFileSync(path.join(outDir, "sw.js"), sw);
    },
  };
}
