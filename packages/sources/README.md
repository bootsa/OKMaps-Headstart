# @okmaps/sources

Source adaptors for the browser version of OKMaps. Each adaptor queries one
data provider and returns `{ papers, content }`, which is the input of
`buildOverviewMap` in `@okmaps/pipeline`. No runtime dependencies; runs in a
browser, a Web Worker or Node 18+.

| Provider | Status | Talks to | Port of (`legacy-server` branch) |
|---|---|---|---|
| PubMed | done | NCBI E-utilities directly (CORS allowed) | `server/preprocessing/other-scripts/pubmed.R` |
| BASE | done | source gateway (BASE needs a registered IP) | `base.R`, `subject_cleaning.R`, `preprocess.R`, `workers/base`, `common/deduplication.py`, `common/enrichment.py` |
| OpenAIRE | done | OpenAIRE search API (CORS not yet checked; a gateway URL can be passed) | `openaire.R`, `run_openaire_projectdata.R` |
| Crossref citations | done | Crossref REST API (CORS allowed) | `metrics.R` (`add_citations`) |
| Places (geo maps), AQUANAVI preset | done | any CSV or JSON table, cached | `workers/common/common/aquanavi` |
| SPARQL (Wikidata, Wikidata scholarly, DBpedia presets) | done | any SPARQL endpoint that allows CORS | new |
| Zenodo (or any InvenioRDM site), optionally one community | done | its REST API (CORS allowed), optional access token | new |
| Zotero (personal and group libraries, collections) | done | Zotero Web API v3 (CORS allowed) | new |
| OpenAlex works | done | OpenAlex API directly (CORS allowed), optional API key | new |

## PubMed

```ts
import { searchPubmed } from "@okmaps/sources";
const { papers, content } = await searchPubmed(
  { q: "climate change", from: "2020-01-01", to: "2024-12-31", sorting: "most-relevant", limit: 100 },
  { apiKey: "...", email: "maps@example.org" }, // both optional
);
```

Failures throw `SourceError` with `reasons`, the same error codes the R
clients return (`detect_error` in `utils.R`), e.g. `"not enough results"`,
`"timeframe too short"`, `"API error: PubMed not reachable"`.

Parity: `test/golden/r/pubmed_golden.R` runs the parsing part of `pubmed.R`
on `test/fixtures/pubmed_efetch.xml` and the test compares every field and the
clustering text. The fixture covers structured abstracts, inline markup,
entities, collective and partial author names, `MedlineDate` years, missing
and duplicate DOIs, and book chapters. R quirks kept on purpose: `NA` printed
into the clustering text and author names (`"Nakamura, NA"`), line breaks
removed without a space, copyright lines appended to the abstract.

Deliberate differences:
- ESummary values are matched to records by PMID rather than by position.
- `readers` is a number rather than a string.
- When a record has two DOIs R adds stray `id1`/`id2` columns; they are left out.

## BASE

```ts
import { fetchBaseContentProviders, searchBase } from "@okmaps/sources";
const contentProviders = await fetchBaseContentProviders("https://gateway.example/base/repositories");
const { papers, content } = await searchBase(
  { q: "digital education", from: "2020-01-01", to: "2024-12-31", document_types: ["121"],
    sorting: "most-relevant", limit: 120, list_size: 100 },
  { endpoint: "https://gateway.example/base/search", contentProviders }, // contentProviders optional
);
```

`endpoint` is a gateway URL that forwards the query string to BASE's
`PerformSearch` interface (adding the API key, from a registered IP) and
returns BASE's XML unchanged; `packages/gateway` is that gateway.
`contentProviders` maps BASE provider names to internal names (the list
`run_base_contentproviders.R` fetches, which the gateway serves at
`/base/repositories`); without it, volume, issue, page and ISSN are not
parsed out of `published_in`.

The port covers the whole chain, and each part is compared with the code it
replaces:

| Part | Port | Checked against |
|---|---|---|
| query building (`preprocess_query`, `get_papers`) | `base/query.ts` | R, 160 queries and parameter sets (`test/golden/r/base_query_golden.R`) |
| keyword cleaning (`clean_subject_string`) | `base/subjects.ts` | R, 3,180 real BASE subject lines (`subject_golden.R`) |
| response parsing, `etl`, title duplicates (`mark_duplicates`) | `base/records.ts` | R with rbace's parser (`base_records_golden.R`) |
| duplicate merging (`filter_duplicates`), annotations, journal fields, text | `base/dedup.ts`, `base/finalize.ts` | the Python worker run on the R output (`test/golden/py/base_worker_golden.py`) |
| rapidfuzz scores | `fuzz.ts` | rapidfuzz, 1,805 string pairs (`fuzz_golden.py`) |

The test fixtures (`test/fixtures/base/*.xml.gz`) are BASE responses rebuilt
from the real records in the R replay inputs, with altered copies added to
exercise duplicate handling (`make_base_fixtures.R`).

R and Python behaviour kept on purpose, so results stay identical:
- In R's default regex engine an ending written `(;|$)?` is not optional, so
  several keyword cleaning rules only fire before a `;` or at the end.
- When no two titles are strict duplicates (ratio below 0.03), R marks no
  record as a duplicate, even pairs below the looser 1/15.83.
- The Python worker finds duplicate groups by substring match on ids.

Left out:
- The MeSH rank columns (`keywords_rank_mesh_*`), which only ranking modes
  2 and 3 use; the pipeline ports mode 0.
- Two crash paths: R fails when every record has the same number (two or
  more) of strict duplicates, and Python fails on a CCSD record with only a
  second ISSN. The port returns a result in both cases.

## OpenAIRE

```ts
import { searchOpenaire, getOpenaireProject } from "@okmaps/sources";
const { papers, content } = await searchOpenaire({ project_id: "643410", funder: "EC" });
const project = await getOpenaireProject({ project_id: "643410", funder: "EC" }); // map header details
```

The search checks that the project exists, then fetches its publications and
datasets (up to 1000 each) from OpenAIRE's search API, the same requests
ropenaire makes. Errors carry the R reason codes (`"project id or funder id
wrong"`, `"not enough results for project"`, `"API error: OpenAIRE not
reachable"`).

Parity: `test/golden/r/openaire_golden.R` runs `get_papers` from
`openaire.R` and `parse_project` from `run_openaire_projectdata.R` on the
responses in `test/fixtures/openaire` (ropenaire stubbed), and the tests
compare every field and the clustering text. Kept as in R: only the first
`<subject>` of a record is used, and `openaire_link` is the first
`<websiteurl>` in the record, which can be a participant's.

One deliberate difference: R fails with "No results retrieved." when a
project has datasets but no publications (it checks the publication count
twice). The port returns the datasets.

The OpenAIRE search API is OpenAIRE's older interface. If it is retired or
does not allow browser requests, `endpoint` takes a gateway URL.

## Crossref citation counts

```ts
import { addCitationCounts } from "@okmaps/sources";
const withCounts = await addCitationCounts(papers, { mailto: "maps@example.org" });
// each paper gets citation_count: number | null
```

The PubMed worker runs this on every map (through the metrics worker). R
asks Crossref's OpenURL service, which browsers can't call, so the port uses
the REST API's `is-referenced-by-count`, 50 DOIs per request. Both are
Crossref's cited-by count. A failed request leaves its counts `null`, as R
leaves them `NA`. Not yet compared against live Crossref answers.

## Places (geo maps)

A place source is a table of places (facilities, field stations, sites)
plus a mapping that says which column holds what. Its records are what the
geo map view draws. Nothing is specific to one project: AQUANAVI, the
mesocosm facilities the geo map was first made for, is one preset.

```ts
import { aquanaviSource, csvTable, registerPlaceSource, searchPlaces } from "@okmaps/sources";

registerPlaceSource(aquanaviSource("https://example.org/data/aquanavi.csv"));
registerPlaceSource({
  id: "stations",
  label: "Field stations",
  title: "field stations",
  table: csvTable("https://example.org/stations.csv"),
  mapping: {
    title: "name", url: "website", latitude: "lat", longitude: "lon", country: "country",
    years: "operating", keywords: "topics",
    description: [{ column: "about", label: "About" }, { column: "equipment", label: "Equipment" }],
  },
});
const { papers } = await searchPlaces("stations", {}, { cache }); // cache: optional, e.g. a MapStorage
```

- **Table** (`table.ts`): `csvTable(url)`, `jsonTable(url, rows?)` or
  `staticTable(rows)`; any `(http) => Promise<Row[]>` works, so a SPARQL,
  Wikidata or Atomic Data loader can return the same rows later.
  `cachedTable` (used by `searchPlaces` when a `cache` is passed) keeps the
  last table for a day and falls back to it when the source can't be
  reached. A `MapStorage` from `@okmaps/storage` fits as the cache.
- **Mapping** (`mapping.ts`, `PlaceMapping`): title, url, image, country,
  continent, coordinates (one `"[lat, lon]"` column or two columns), a
  free-text time span ("2016 - present", "since 2009"), description
  sections and keywords. Places at the same spot are spread a few metres
  apart on a spiral, so every marker can be clicked. The record id is the
  SHA-256 of url and location unless the mapping gives an `id` function.
- **Registry**: `registerPlaceSource`, `getPlaceSource`, `placeSources`,
  so a deployment offers the sources it registers.

Like the old API, a search returns the whole table; the query is only the
map's title.

Parity: `test/golden/py/aquanavi_golden.py` runs the old API's mapping on
the facility table (`test/fixtures/places/aquanavi.csv`, from
`mesocosm_data_cleaned.csv`) and on its edge cases
(`aquanavi-edge-cases.csv`); the AQUANAVI preset gives identical records,
including the spread coordinates. The test also checks them against the
production map embedded on mesocosm.org/facilities. Kept as in Python: an
en dash in the time span is not read ("2016 – present" gives no years), a
coordinate of exactly 0 is written as missing, and an empty "Controlled
Parameters" cell is labelled with a capital P.

## XML

`src/xml.ts` is a small XML reader (DOMParser is not available in Web
Workers). It drops whitespace-only text the same way libxml2 does with xml2's
default `NOBLANKS`, so `textOf` equals R's `xml_text`.

## Tests

```
pnpm install && pnpm typecheck && pnpm test
```

The goldens were made by R and Python scripts that ran the old server's code
(`scripts/extract_subject_tables.R`, `test/golden/r/*.R`, `test/golden/py/*.py`).
They were removed with the `legacy/` folder; check out commit `ec6a09b` to run
them again. `test/fixtures/contentproviders.json.gz` is the old Python
worker's BASE provider list, which the tests use as the gateway's answer.

## SPARQL

Any SPARQL 1.1 endpoint as a source: a query template, and which result
variable holds which map field. Plain JSON config, no UI code, so the
settings page, a Web Worker or a server can use it alike.

```ts
import { searchSparql, sparqlPreset } from "@okmaps/sources";
const { papers, content } = await searchSparql(sparqlPreset("wikidata")!.config, { q: "coral bleaching" });

// Your own endpoint and query:
await searchSparql(
  {
    endpoint: "https://query.wikidata.org/sparql",
    query: 'SELECT ?item ?label WHERE { ... "{{q}}" ... } LIMIT {{limit}}',
    mapping: { title: "label" }, // the rest keep their default variable names
    wikipediaIntros: true,
  },
  { q: "coral bleaching" },
);
```

Placeholders (`src/sparql/template.ts`): `{{q}}` is the search, escaped for a
`"..."` literal, so it can never end the string and change the query;
`{{q_words}}` is `'word' AND 'word'` for Virtuoso's `bif:contains`;
`{{limit}}` and `{{lang}}`. Unknown placeholders are refused.

Default variables: `?item` (id; rows with the same id are merged, so one
row per author or keyword is fine), `?title`, `?abstract`, `?authors`,
`?year` (a year or any xsd date), `?url`, `?doi`, `?subjects`,
`?published_in`. Records without a title are left out. Several values in one cell may be separated by `;`
(keywords also `|`); URIs become their last segment (`Category:Coral_reefs`
→ "Coral reefs").

Presets (`src/sparql/presets.ts`):
- `wikidata`: Wikidata items found by Wikidata's own search
  (`wikibase:mwapi`), with label (falling back to `mul`), description,
  kinds/topics/genres as keywords, creators/founders as authors and dates.
  Scholarly articles are left to the next preset.
- `wikidata-scholarly`: scholarly articles on `query-scholarly.wikidata.org`
  (the graph split off in 2025), with author names, venue, DOI and date.
- `dbpedia`: DBpedia (Wikipedia as linked data) resources whose name matches (`bif:contains`), with
  their categories as keywords and Wikipedia introductions as abstracts
  (DBpedia's own abstracts are often missing).

The queries read labels with `rdfs:label` rather than `SERVICE
wikibase:label`, which only Blazegraph has; the search part (`mwapi`,
`bif:contains`) is endpoint-specific and is what changes for another backend
such as QLever.

Errors are `SourceError`s with reasons: `API error: SPARQL endpoint not
reachable` (also CORS refusals, which a browser cannot tell apart),
`API error: SPARQL rate limited` (a short `Retry-After` is waited for once;
longer ones say how long to wait), `API error: timeout`, `SPARQL query
error` (with the endpoint's own one-line message) and `unexpected SPARQL
response`. Outside a browser pass `headers: { "User-Agent": "tool/1.0 (contact)" }`:
Wikimedia refuses requests without one.

## Zenodo

`searchZenodo(config, { q })` searches the records of [Zenodo](https://zenodo.org)
(or any other InvenioRDM site, `baseUrl`) and returns map records. Zenodo
answers with CORS headers for every origin, so it runs in the browser
without a gateway.

```ts
const result = await searchZenodo(
	{ community: "dryad", type: "dataset", limit: 200, accessToken: undefined },
	{ q: "coral reef" },
);
buildOverviewMap({ papers: result.papers, content: result.content, service: "zenodo" }, resources);
```

- `community`: a community's id or its URL; searches `/api/communities/<id>/records`
  (an unknown community is a 404, "Zenodo community not found"). Search terms can be
  empty then: the community's newest records.
- `type` / `subtype`: resource type filters (`ZENODO_TYPES`), `filter`: extra
  search syntax added with AND (e.g. `access_status:open`), `sort`: `ZENODO_SORTS`.
- `limit` (default 100, at most 1000): pages of 25 without a token, 100 with one.
- `accessToken`: sent as `Authorization: Bearer`, never in the URL. The app keeps
  it in the source's settings only and drops it from maps (`withoutToken`).
- Rate limits (30 searches a minute without a token): a 429 or an empty
  window is waited out when it ends within `maxRetryWaitMs` (default 60 s);
  otherwise the search fails ("API error: Zenodo rate limited") or keeps the
  pages it already has.
- Records: creators as "Family, Given; …", the publication date as `year`,
  keywords and subjects as `subject`, the description as plain text,
  `resulttype` from the resource type, `oa_state` from `access_right`,
  links to the record page.
- Outside a browser, pass a `User-Agent` in `headers`: Zenodo may answer
  requests without one with an HTML 403 ("unusual traffic").

## Zotero

A Zotero library (a person's or a group's), or one collection of it, through
the [Web API v3](https://www.zotero.org/support/dev/web_api/v3/start). Plain
JSON config, no UI code.

```ts
import { searchZotero, zoteroCollections, zoteroLibraries } from "@okmaps/sources";

// A public group's collection; the library can also be "user:45", a bare group ID or a zotero.org link.
await searchZotero({ library: "group:4846685", collection: "8UG7PVLY" }, { q: "groundwater" });

// Private libraries need a key with read access (zotero.org/settings/keys).
const libraries = await zoteroLibraries(apiKey); // the key's own library and its groups
const collections = await zoteroCollections(libraries[0].library, { apiKey }); // as a tree, with paths
await searchZotero({ library: libraries[0].library, apiKey, subcollections: true, collection: collections[0].key }, {});
```

- Search terms go to the API's quick search (`qmode` `titleCreatorYear`, or
  `everything` for all fields and full texts); no terms take every item.
  Top-level items only, 100 per page, up to `limit` (default 100, at most 1000).
  With `subcollections`, each collection below the chosen one is searched too.
- Records: title, abstract, authors (`Last, First`; every creator when there
  are no authors), year (`meta.parsedDate`, else the first four digits of
  the date), DOI (the field, or `DOI: …` in Extra), link (URL, else the DOI,
  else the item's zotero.org page), tags as keywords, where it appeared
  (journal, book, proceedings, website, university, publisher, …) and the
  item type. Notes and attachments are left out.
- The key goes in the `Zotero-API-Key` header, never the URL. Use
  `withoutApiKey(config)` before keeping a config with a map.
- Errors are `SourceError`s with reasons `Zotero access denied` (403: a
  private library without a key, or a key that cannot read it), `Zotero
  library not found` (404), `API error: Zotero rate limited` (429/503; a
  short `Retry-After` is waited for once, and a `Backoff` header delays the
  next requests), `API error: Zotero not reachable`, `API error: timeout`
  and `unexpected Zotero response`.

## OpenAlex

OpenAlex works (`/works`) as map records. Plain JSON config, no UI code.

```ts
import { searchOpenalex } from "@okmaps/sources";
const { papers, content, total, partial } = await searchOpenalex(
  { apiKey, email, filter: "is_oa:true,type:article", searchIn: "all", limit: 200 },
  { q: "coral bleaching", from: "2015", to: "2024-06-30", sorting: "most-cited" },
);
```

- Search: `searchIn: "all"` uses `search=` (title, abstract, full text);
  `"title_and_abstract"` and `"title"` use the `*.search` filters. `filter`
  is appended in OpenAlex syntax (`key:value,...`; checked for shape by
  `checkOpenalexConfig`). `from`/`to` become publication date filters
  (a bare year means its first or last day). Sorting: relevance (default),
  `publication_date:desc` or `cited_by_count:desc`.
- Paging: cursor paging (`cursor=*`, then `meta.next_cursor`), 100 works per
  page, up to `limit` (default 100, at most 1000). Only the fields the records
  need are asked for (`select=`).
- Records: abstract rebuilt from `abstract_inverted_index`; authors as
  "Last, First" (`;`-separated, as the map's author parsing expects);
  keywords, then the primary and other topics as subjects (deprecated
  concepts only when a work has neither); `cited_by_count` as `readers` and
  `citation_count`; `oa_state` 1/0 from `open_access.is_oa`; `url` is the
  landing page, else the DOI; `link` prefers the open access PDF.
- Keys and limits (checked 2026-11-08): OpenAlex now meters requests by a
  daily budget. Without a key, everyone behind one IP shares a free budget;
  a search costs 10 credits, a single work by id none. The key goes in the
  `api_key` query parameter, not an `Authorization` header, so browsers send
  no CORS preflight. `email` is sent as `mailto`.
- Errors are `SourceError`s with reasons: `API error: OpenAlex not
  reachable` (also 401/403, with a hint to check the key), `API error:
  OpenAlex rate limited` (a `Retry-After` of up to 10 s is waited for once;
  longer ones say how long, and suggest a key when there is none), `API
  error: timeout`, `OpenAlex query error` (400, with OpenAlex's message) and
  `unexpected OpenAlex response`. When a later page fails, the pages so far
  are returned with `partial` set to the reason.
- Fixtures (`test/fixtures/openalex/`) are real works, fetched one by one
  by DOI and id, put into two result pages.
