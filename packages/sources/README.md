# @okmaps/sources

Source adaptors for the browser version of OKMaps. Each adaptor queries one
data provider and returns `{ papers, content }`, which is the input of
`buildOverviewMap` in `@okmaps/pipeline`. No runtime dependencies; runs in a
browser, a Web Worker or Node 18+.

| Provider | Status | Talks to | Port of |
|---|---|---|---|
| PubMed | done | NCBI E-utilities directly (CORS allowed) | `server/preprocessing/other-scripts/pubmed.R` |
| BASE | done | source gateway (BASE needs a registered IP) | `base.R`, `subject_cleaning.R`, `preprocess.R`, `workers/base`, `common/deduplication.py`, `common/enrichment.py` |
| OpenAIRE | done | OpenAIRE search API (CORS not yet checked; a gateway URL can be passed) | `openaire.R`, `run_openaire_projectdata.R` |
| Crossref citations | done | Crossref REST API (CORS allowed) | `metrics.R` (`add_citations`) |

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

## XML

`src/xml.ts` is a small XML reader (DOMParser is not available in Web
Workers). It drops whitespace-only text the same way libxml2 does with xml2's
default `NOBLANKS`, so `textOf` equals R's `xml_text`.

## Tests

```
npm ci && npm run typecheck && npm test
```

Regenerating the goldens needs R with xml2, data.table, jsonlite, logging,
stringi, dplyr, stringr, stringdist and plyr, and Python with pandas, numpy,
rapidfuzz, Levenshtein, dateparser and redis:

```
Rscript test/golden/r/pubmed_golden.R test/fixtures/pubmed_efetch.xml > test/golden/pubmed_efetch.json
Rscript scripts/extract_subject_tables.R
Rscript test/golden/r/subject_golden.R test/golden/subject_cleaning.json.gz
Rscript test/golden/r/base_query_golden.R test/golden/base_query.json
Rscript test/golden/r/make_base_fixtures.R test/fixtures/base   # then gzip -9 -n the .xml files
Rscript test/golden/r/base_records_golden.R test/fixtures/base test/golden/base_records
PYTHONPATH=../../server/workers/common:../../server/workers/base/src \
  python test/golden/py/base_worker_golden.py test/golden/base_records test/golden/base_worker
python test/golden/py/fuzz_golden.py test/golden/fuzz.json.gz
Rscript test/golden/r/openaire_golden.R test/fixtures/openaire test/golden/openaire
```
