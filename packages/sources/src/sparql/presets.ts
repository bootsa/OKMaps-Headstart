/**
 * Ready-made SPARQL sources: Wikidata items and Wikidata's scholarly
 * articles (both found with Wikidata's own search through the Wikidata
 * Query Service), and DBpedia (Wikipedia's infoboxes and categories as
 * linked data).
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

/**
 * Wikidata items found by Wikidata's own search (scholarly articles left to
 * their own preset), with label, description, kinds, topics, makers and dates.
 * Labels fall back to "mul", Wikidata's language-neutral labels.
 */
export const WIKIDATA_QUERY = `${WIKIDATA_PREFIXES}
SELECT ?item ?title ?abstract ?url ?year ?subjects ?authors WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org";
                    wikibase:api "Generator";
                    wikibase:limit {{limit}};
                    mwapi:generator "search";
                    mwapi:gsrsearch "{{q}} -haswbstatement:P31=Q13442814";
                    mwapi:gsrnamespace "0";
                    mwapi:gsrlimit "max".
    ?item wikibase:apiOutputItem mwapi:title.
    ?rank wikibase:apiOutput "@index".
  }
  BIND(?item AS ?url)
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "{{lang}}") }
  OPTIONAL { ?item rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
  BIND(COALESCE(?label, ?mul) AS ?title)
  OPTIONAL { ?item schema:description ?abstract FILTER(LANG(?abstract) = "{{lang}}") }
  OPTIONAL {
    ?item wdt:P31|wdt:P279|wdt:P921|wdt:P101|wdt:P361|wdt:P136 ?kind.
    ?kind rdfs:label ?subjects FILTER(LANG(?subjects) = "{{lang}}")
  }
  OPTIONAL {
    ?item wdt:P50|wdt:P170|wdt:P112|wdt:P61|wdt:P178 ?maker.
    ?maker rdfs:label ?authors FILTER(LANG(?authors) = "{{lang}}")
  }
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
		id: "wikidata",
		label: "Wikidata",
		description:
			"Wikidata items that match the search, with their labels, descriptions, kinds, topics, makers and dates.",
		config: {
			endpoint: "https://query.wikidata.org/sparql",
			query: WIKIDATA_QUERY,
			limit: 100,
			lang: "en",
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
