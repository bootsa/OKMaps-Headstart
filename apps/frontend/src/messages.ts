/** Error reason codes (detect_error in the R clients) as messages for people. */
const MESSAGES: Record<string, string> = {
  "not enough results": "There are not enough results for this search to make a map. Try broader terms or a longer time range.",
  "timeframe too short": "There are not enough results in this time range. Try a longer time range.",
  "API error: PubMed not reachable": "PubMed can't be reached right now. Please try again in a few minutes.",
  "API error: requested metadata size": "PubMed could not return the records for this search. Please try again.",
  "unexpected PubMed API error": "PubMed returned an unexpected error. Please try again.",
  "BASE error: timeout": "BASE did not answer in time. Please try again in a few minutes.",
  "API error: BASE not reachable": "BASE can't be reached right now. Please try again in a few minutes.",
  "API error: timeout": "The search took too long. Please try again.",
  "project id or funder id wrong": "No project was found with this grant number and funder.",
  "not enough results for project": "This project has no publications or datasets in OpenAIRE yet.",
  "API error: OpenAIRE not reachable": "OpenAIRE can't be reached right now. Please try again in a few minutes.",
};

export function errorMessage(reasons: string[], fallback: string): string {
  for (const r of reasons) if (MESSAGES[r]) return MESSAGES[r];
  return `The map could not be made: ${fallback}`;
}
