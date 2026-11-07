import { geomapView } from "./geomap/view";
import { knowledgeMapView } from "./knowledge-map/view";
import { registerView } from "./registry";
import { streamgraphView } from "./streamgraph/view";

/** Every view this package ships. */
export const coreViews = [knowledgeMapView, streamgraphView, geomapView];

/** Registers every view this package ships (a page that draws any kind of map). */
export function registerCoreViews(): void {
	for (const view of coreViews) registerView(view);
}
