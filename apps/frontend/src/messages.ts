/** Error reason codes (detect_error in the R clients) as messages for people. */
const MESSAGES: Record<string, string> = {
	"not enough results":
		"There are not enough results for this search to make a map. Try broader terms or a longer time range.",
	"timeframe too short": "There are not enough results in this time range. Try a longer time range.",
	"API error: PubMed not reachable": "PubMed can't be reached right now. Please try again in a few minutes.",
	"API error: requested metadata size": "PubMed could not return the records for this search. Please try again.",
	"unexpected PubMed API error": "PubMed returned an unexpected error. Please try again.",
	"BASE error: timeout": "BASE did not answer in time. Please try again in a few minutes.",
	"API error: BASE not reachable": "BASE can't be reached right now. Please try again in a few minutes.",
	"API error: timeout": "The search took too long. Please try again.",
	"project id or funder id wrong": "No project was found with this grant number and funder.",
	"not enough results for project": "This project has no publications or datasets in OpenAIRE yet.",
	"not enough keywords":
		"The results don't share enough keywords over the years to make a streamgraph. Try broader terms or a knowledge map.",
	"API error: OpenAIRE not reachable": "OpenAIRE can't be reached right now. Please try again in a few minutes.",
};

/** Reasons whose own message says more than a fixed one could (what the endpoint said). */
const OWN_MESSAGE = new Set([
	"API error: SPARQL endpoint not reachable",
	"API error: SPARQL rate limited",
	"SPARQL query error",
	"unexpected SPARQL response",
]);

export function errorMessage(reasons: string[], fallback: string): string {
	if (reasons.some((r) => OWN_MESSAGE.has(r))) return `The map could not be made: ${fallback}`;
	for (const r of reasons) if (MESSAGES[r]) return MESSAGES[r];
	return `The map could not be made: ${fallback}`;
}
