// Writes a Markdown table of each package's test coverage (vitest's
// coverage-summary.json, made by `pnpm coverage`) to stdout; CI appends it
// to the job summary.
import fs from "node:fs";
import path from "node:path";

type Metric = { total: number; covered: number; pct: number };
type Summary = { total: Record<"lines" | "statements" | "functions" | "branches", Metric> };

const root = path.resolve(import.meta.dirname, "../..");
const rows: string[] = [];
const sum = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
for (const group of ["apps", "packages"]) {
	for (const name of fs.readdirSync(path.join(root, group)).sort()) {
		const file = path.join(root, group, name, "coverage", "coverage-summary.json");
		if (!fs.existsSync(file)) continue;
		const { total } = JSON.parse(fs.readFileSync(file, "utf8")) as Summary;
		for (const k of ["lines", "branches", "functions"] as const) {
			sum[k][0] += total[k].covered;
			sum[k][1] += total[k].total;
		}
		rows.push(`| ${group}/${name} | ${total.lines.pct}% | ${total.branches.pct}% | ${total.functions.pct}% |`);
	}
}
const pct = ([covered, total]: number[]) => (total ? `${Math.round((covered / total) * 1000) / 10}%` : "–");
console.log("### Test coverage\n");
console.log("| Package | Lines | Branches | Functions |\n|---|---|---|---|");
console.log(rows.join("\n"));
console.log(`| **all** | **${pct(sum.lines)}** | **${pct(sum.branches)}** | **${pct(sum.functions)}** |`);
