// Builds the visualisation (@okmaps/ui, webpack) for the app and copies it to
// public/vis, with tags.json listing its scripts and styles in load order.
// Needs `pnpm install` first. APP_BASE sets the URL path the app is served
// from (default "/").
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, "../../../packages/ui");
const out = path.resolve(here, "../public/vis");
const base = process.env.APP_BASE ?? "/";
const publicPath = `${base}vis/`;

execFileSync("pnpm", ["exec", "webpack", "--mode=production", "--env", `publicPath=${publicPath}`], {
	cwd: ui,
	stdio: "inherit",
});

const dist = path.join(ui, "dist");
const php = fs.readFileSync(path.join(dist, "headstart.php"), "utf8");
const strip = (u) => (u.startsWith(publicPath) ? u.slice(publicPath.length) : u);
const scripts = [...php.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => strip(m[1]));
const styles = [...php.matchAll(/<link[^>]*href="([^"]+)"/g)].map((m) => strip(m[1]));

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(dist, out, { recursive: true, filter: (src) => !src.endsWith("headstart.php") });
fs.writeFileSync(path.join(out, "tags.json"), JSON.stringify({ scripts, styles }, null, 2) + "\n");
console.log(`vis copied to ${path.relative(process.cwd(), out)}: ${scripts.length} scripts, ${styles.length} styles`);
