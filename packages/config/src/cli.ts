#!/usr/bin/env node
/**
 * okmaps: custom OKMaps versions from a config file.
 *
 *   pnpm okmaps configure [file]   asks what the version offers and writes the config
 *   pnpm okmaps check <file>       checks a config (errors, warnings, secrets)
 *   pnpm okmaps print <file>       the config with every default filled in
 *   pnpm okmaps build <file> [--out <dir>] [--base </path/>]
 *                                  builds the version (apps/frontend) into <dir>
 *
 * Default file: okmaps.config.json. Relative paths are from where you run it
 * (pnpm runs root scripts from the repository root; INIT_CWD is used then).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ConfigError, loadConfig } from "./node.ts";
import { formatProblems, resolveConfig } from "./resolve.ts";
import type { OkmapsConfig } from "./types.ts";
import { wizard } from "./wizard.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const APP = path.join(ROOT, "apps/frontend");
const cwd = process.env.INIT_CWD ?? process.cwd();

const USAGE = `Usage:
  okmaps configure [file]                 ask what the version offers, write the config
  okmaps check <file>                     check a config
  okmaps print <file>                     the config with the defaults filled in
  okmaps build <file> [--out dir] [--base /path/]
                                          build the version into dir (default dist-<name>)`;

function args(list: string[]) {
	const flags: Record<string, string> = {};
	const rest: string[] = [];
	for (let i = 0; i < list.length; i++) {
		const a = list[i];
		if (a.startsWith("--")) {
			const [k, v] = a.slice(2).split("=", 2);
			flags[k] = v ?? list[++i] ?? "";
		} else rest.push(a);
	}
	return { flags, rest };
}

function report(file: string): boolean {
	try {
		const loaded = loadConfig(file, { cwd });
		if (loaded.warnings.length) console.log(`Warnings:\n${formatProblems(loaded.warnings)}`);
		if (loaded.secrets.length)
			console.log(
				`\nTHIS BUILD WOULD CONTAIN SECRETS: ${loaded.secrets.join(", ")}.\nAnyone who can open the site can read them; do not publish it.`,
			);
		console.log(`${path.relative(cwd, loaded.file ?? file) || file} is fine.`);
		return true;
	} catch (err) {
		if (err instanceof ConfigError) {
			console.error(err.message);
			return false;
		}
		throw err;
	}
}

async function configure(file: string) {
	const abs = path.resolve(cwd, file);
	let start: OkmapsConfig = {};
	if (fs.existsSync(abs)) {
		start = JSON.parse(fs.readFileSync(abs, "utf8"));
		console.log(`Changing ${file}.`);
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const config = await wizard({ ask: (q) => rl.question(q), print: (t) => console.log(t) }, start);
		if (!config.$schema) {
			const schema = path.relative(path.dirname(abs), path.join(ROOT, "packages/config/schema.json"));
			config.$schema = schema.split(path.sep).join("/");
		}
		fs.writeFileSync(abs, `${JSON.stringify(config, null, "\t")}\n`);
		console.log(`\nWrote ${file}.`);
		const { errors, warnings } = resolveConfig(config, { keepEnv: true });
		if (warnings.length) console.log(`Warnings:\n${formatProblems(warnings)}`);
		if (errors.length) {
			console.log(`It has problems to fix before it builds:\n${formatProblems(errors)}`);
			return;
		}
		const build = (await rl.question("Build it now? (y/N): ")).trim().toLowerCase();
		if (build === "y" || build === "yes") {
			rl.close();
			runBuild(file, {});
		} else console.log(`Build it with: pnpm okmaps build ${file}`);
	} finally {
		rl.close();
	}
}

function runBuild(file: string, flags: Record<string, string>) {
	if (!report(file)) process.exit(1);
	const abs = path.resolve(cwd, file);
	const name = path.basename(abs).replace(/(\.okmaps)?(\.config)?\.json$/, "") || "okmaps";
	const out = path.resolve(cwd, flags.out || `dist-${name}`);
	console.log(`Building into ${out} ...`);
	const env = { ...process.env, OKMAPS_CONFIG: abs, ...(flags.base ? { APP_BASE: flags.base } : {}) };
	const result = spawnSync("pnpm", ["exec", "vite", "build", "--outDir", out, "--emptyOutDir"], {
		cwd: APP,
		env,
		stdio: "inherit",
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
	console.log(
		`\nBuilt ${out}. Serve it as static files${flags.base ? ` under ${flags.base}` : " at a site's root (or pass --base /path/)"}.`,
	);
}

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	const { flags, rest: files } = args(rest);
	const file = files[0] ?? "okmaps.config.json";
	switch (command) {
		case "configure":
		case "init":
			return configure(file);
		case "check":
			process.exit(report(file) ? 0 : 1);
			return;
		case "print": {
			try {
				console.log(JSON.stringify(loadConfig(file, { cwd }).config, null, "\t"));
			} catch (err) {
				console.error(err instanceof Error ? err.message : err);
				process.exit(1);
			}
			return;
		}
		case "build":
			return runBuild(file, flags);
		default:
			console.log(USAGE);
			process.exit(command && command !== "help" && command !== "--help" ? 1 : 0);
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
