import { aquanaviSource, csvTable, jsonTable, type PlaceSource } from "@okmaps/sources";
import type { PlaceSourceConfig } from "./places.ts";

/** A setting as an @okmaps/sources place source; a preset fills in what the setting leaves out. */
export function placeSource(c: PlaceSourceConfig): PlaceSource {
	const table = c.format === "json" || (!c.format && /\.json(\?|$)/i.test(c.url)) ? jsonTable(c.url) : csvTable(c.url);
	const preset = c.preset === "aquanavi" ? aquanaviSource(table) : null;
	const mapping = preset ? { ...preset.mapping, ...c.mapping } : c.mapping;
	if (!mapping) throw new Error(`place source ${c.id} has no mapping`);
	return { id: c.id, label: c.label, title: c.title ?? preset?.title ?? c.label, table, mapping };
}
