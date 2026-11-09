import { geomapType } from "./geomap";
import { knowledgeMapType } from "./knowledge-map";
import { registerViewType } from "./registry";
import { streamgraphType } from "./streamgraph";
import type { ViewType } from "./types";

/** Every view type this package ships. */
export const coreViewTypes: ViewType[] = [knowledgeMapType, streamgraphType, geomapType];

export function registerCoreViewTypes(): void {
	for (const t of coreViewTypes) registerViewType(t);
}
