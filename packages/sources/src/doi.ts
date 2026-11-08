/**
 * A DOI as the map keeps it: trimmed and in lower case. DOIs are
 * case-insensitive, and providers write them in either case (Wikidata in
 * upper case, OpenAlex and Crossref in lower case), so this is what lets
 * records of the same work from different sources be compared.
 */
export function normalizeDoi(doi: string | null | undefined): string {
	return (doi ?? "").trim().toLowerCase();
}
