/** Which view draws a map; kept apart so the map page loads no pipeline code. */

/** How the map is drawn: a knowledge map ("overview") or a streamgraph ("timeline"). */
export type VisType = "overview" | "timeline";

/** The view a saved or shared map is drawn with (its params' vis_type). */
export function visTypeOf(record: { context: { params?: unknown } }): VisType {
	const params = record.context.params;
	try {
		const p = typeof params === "string" ? JSON.parse(params) : params;
		return p?.vis_type === "timeline" ? "timeline" : "overview";
	} catch {
		return "overview";
	}
}
