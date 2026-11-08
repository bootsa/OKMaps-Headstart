/**
 * Ready-made SPARQL sources. Wikipedia has no SPARQL endpoint of its own,
 * so "search Wikipedia" goes through the Wikidata Query Service (which can
 * call Wikipedia's search and joins the articles' Wikidata facts) or
 * DBpedia (Wikipedia's infoboxes and categories as linked data).
 *
 * The queries avoid SERVICE wikibase:label (Blazegraph only) and read
 * labels with rdfs:label, so they move more easily to another Wikidata
 * backend (QLever) with only the search part to change.
 */
import type { SparqlSourceConfig } from "./source.js";

export interface SparqlPreset {
	id: string;
	label: string;
	description: string;
	config: SparqlSourceConfig;
}

const WIKIDATA_PREFIXES = `PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX mwapi: <https://www.mediawiki.org/ontology#API/>
PREFIX schema: <http://schema.org/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

/** Wikipedia's own search, with each article's Wikidata description, kind, topics and dates. */
export const WIKIPEDIA_QUERY = `${WIKIDATA_PREFIXES}
SELECT ?item ?title ?abstract ?url ?year ?subjects WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "{{lang}}.wikipedia.org";
                    wikibase:api "Generator";
                    wikibase:limit {{limit}};
                    mwapi:generator "search";
                    mwapi:gsrsearch "{{q}}";
                    mwapi:gsrnamespace "0";
                    mwapi:gsrlimit "max".
    ?item wikibase:apiOutputItem mwapi:item.
    ?title wikibase:apiOutput mwapi:title.
    ?rank wikibase:apiOutput "@index".
  }
  BIND(IRI(CONCAT("https://{{lang}}.wikipedia.org/wiki/", ENCODE_FOR_URI(REPLACE(?title, " ", "_")))) AS ?url)
  OPTIONAL { ?item schema:description ?abstract FILTER(LANG(?abstract) = "{{lang}}") }
  OPTIONAL { ?item (wdt:P31|wdt:P921|wdt:P101)/rdfs:label ?subjects FILTER(LANG(?subjects) = "{{lang}}") }
  OPTIONAL { ?item wdt:P577|wdt:P571|wdt:P580|wdt:P585 ?year }
}
ORDER BY xsd:integer(?rank)`;

/**
 * Scholarly articles in Wikidata whose title or label matches, with authors,
 * venue, DOI and topics. They live in their own graph since 2025; the labels
 * of their topics and journals come from the main graph (wdsubgraph).
 */
export const WIKIDATA_SCHOLARLY_QUERY = `${WIKIDATA_PREFIXES}
PREFIX wdsubgraph: <https://query.wikidata.org/subgraph/>
SELECT ?item ?title ?url ?year ?doi ?authors ?published_in ?subjects WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org";
                    wikibase:api "Generator";
                    wikibase:limit {{limit}};
                    mwapi:generator "search";
                    mwapi:gsrsearch "haswbstatement:P31=Q13442814 {{q}}";
                    mwapi:gsrlimit "max".
    ?item wikibase:apiOutputItem mwapi:title.
    ?rank wikibase:apiOutput "@index".
  }
  BIND(?item AS ?url)
  OPTIONAL { ?item wdt:P1476 ?title }
  OPTIONAL { ?item wdt:P577 ?year }
  OPTIONAL { ?item wdt:P356 ?doi }
  OPTIONAL { ?item wdt:P2093 ?authors }
  OPTIONAL {
    ?item wdt:P1433 ?venue.
    SERVICE wdsubgraph:wikidata_main { ?venue rdfs:label ?published_in FILTER(LANG(?published_in) = "{{lang}}") }
  }
  OPTIONAL {
    ?item wdt:P921 ?topic.
    SERVICE wdsubgraph:wikidata_main { ?topic rdfs:label ?subjects FILTER(LANG(?subjects) = "{{lang}}") }
  }
}
ORDER BY xsd:integer(?rank)`;

/** DBpedia resources whose name matches, with their Wikipedia article and categories. */
export const DBPEDIA_QUERY = `PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?item ?title ?abstract ?url ?subjects WHERE {
  {
    SELECT DISTINCT ?item ?title WHERE {
      ?item rdfs:label ?title .
      ?title bif:contains "{{q_words}}" .
      FILTER(LANG(?title) = "{{lang}}")
      ?item foaf:isPrimaryTopicOf ?page .
    }
    LIMIT {{limit}}
  }
  OPTIONAL { ?item foaf:isPrimaryTopicOf ?url }
  OPTIONAL { ?item dbo:abstract ?abstract FILTER(LANG(?abstract) = "{{lang}}") }
  OPTIONAL { ?item dct:subject ?subjects }
}`;

export const SPARQL_PRESETS: SparqlPreset[] = [
	{
		id: "wikipedia",
		label: "Wikipedia (through Wikidata)",
		description:
			"Searches Wikipedia's articles with the Wikidata Query Service, adds their Wikidata facts and the articles' introductions.",
		config: {
			endpoint: "https://query.wikidata.org/sparql",
			query: WIKIPEDIA_QUERY,
			limit: 100,
			lang: "en",
			wikipediaIntros: true,
		},
	},
	{
		id: "wikidata-scholarly",
		label: "Wikidata scholarly articles",
		description: "Scholarly articles described in Wikidata, with authors, journal, DOI and main subjects.",
		config: {
			endpoint: "https://query-scholarly.wikidata.org/sparql",
			query: WIKIDATA_SCHOLARLY_QUERY,
			limit: 100,
			lang: "en",
		},
	},
	{
		id: "dbpedia",
		label: "DBpedia",
		description: "Wikipedia's articles as linked data: names that match, with their categories as keywords.",
		config: {
			endpoint: "https://dbpedia.org/sparql",
			query: DBPEDIA_QUERY,
			limit: 100,
			lang: "en",
			wikipediaIntros: true,
		},
	},
];

export function sparqlPreset(id: string): SparqlPreset | undefined {
	return SPARQL_PRESETS.find((p) => p.id === id);
}
