/**
 * The place sources this site offers for geo maps. Settings only (JSON,
 * so they can be posted to the map worker); src/place-source.ts turns
 * them into @okmaps/sources place sources.
 *
 * The default is the AQUANAVI facility table bundled with the site
 * (public/data/aquanavi.csv). A build names others in its config's
 * sources.places (or VITE_PLACE_SOURCES), a JSON list of PlaceSourceSetting, e.g.
 *   [{"id":"stations","label":"Field stations","url":"https://example.org/stations.csv",
 *     "mapping":{"title":"name","latitude":"lat","longitude":"lon"}}]
 * and {"preset":"aquanavi","url":"..."} for the AQUANAVI columns.
 */
import type { PlaceMapping } from "@okmaps/sources";
import { config } from "./app.ts";

export interface PlaceSourceSetting {
	/** Map service id ("aquanavi"). */
	id?: string;
	label?: string;
	/** Map title when the search gives none. */
	title?: string;
	/** The table; relative URLs are resolved against the site. */
	url: string;
	format?: "csv" | "json";
	/** Use a preset's columns (and id, label and title unless given). */
	preset?: "aquanavi";
	/** Columns (required without a preset); `id` functions can't be given here. */
	mapping?: Omit<PlaceMapping, "id">;
}

/** The build's place tables (VITE_PLACE_SOURCES is read into the config at build time). */
function configured(): PlaceSourceSetting[] {
	return config.sources.offer.includes("places") ? (config.sources.places as PlaceSourceSetting[]) : [];
}

export type PlaceSourceConfig = PlaceSourceSetting & { id: string; label: string };

/** The place sources with absolute URLs, id and label. */
export function placeSettings(base = location.href): PlaceSourceConfig[] {
	return configured().map((s) => ({
		...s,
		id: s.id ?? s.preset ?? "places",
		label: s.label ?? (s.preset === "aquanavi" ? "Mesocosm facilities (AQUANAVI)" : (s.id ?? "Places")),
		title: s.title ?? (s.preset === "aquanavi" ? "aquatic mesocosm facilities" : undefined),
		url: new URL(s.url, base).href,
	}));
}
