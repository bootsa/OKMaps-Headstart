import { geomapType } from "@okmaps/core";
import type { MapView } from "../types";
import Geomap from "./Geomap.svelte";
import GeomapInfo from "./GeomapInfo.svelte";

export { geomapProcessor } from "@okmaps/core";

/** The geo map (visType "geomap"): a pin per place on OpenStreetMap tiles. */
export const geomapView: MapView = {
	...geomapType,
	component: Geomap,
	// Above Leaflet's attribution line.
	overlayInset: "2.25rem",
	info: GeomapInfo,
};
