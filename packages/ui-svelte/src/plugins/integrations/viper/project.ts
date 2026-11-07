/** The OpenAIRE page of a project, by its OpenAIRE object id. */
export function projectPage(objId: unknown): string {
	const id = typeof objId === "string" || typeof objId === "number" ? String(objId) : "";
	return `https://www.openaire.eu/search/project?projectId=${encodeURIComponent(id)}`;
}
