# @okmaps/sources

Source adaptors for the browser version of OKMaps. Each adaptor queries one
data provider and returns `{ papers, content }`, which is the input of
`buildOverviewMap` in `@okmaps/pipeline`. No runtime dependencies; runs in a
browser, a Web Worker or Node 18+.

| Provider | Status | Talks to | Port of |
|---|---|---|---|
| PubMed | done | NCBI E-utilities directly (CORS allowed) | `server/preprocessing/other-scripts/pubmed.R` |
| BASE | planned | source gateway (BASE needs a whitelisted IP) | `base.R`, `workers/base`, `common/deduplication.py` |
| OpenAIRE | planned | OpenAIRE API | `openaire.R` |
| Crossref citations | planned | Crossref REST API | `metrics.R` (`add_citations`) |

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

## XML

`src/xml.ts` is a small XML reader (DOMParser is not available in Web
Workers). It drops whitespace-only text the same way libxml2 does with xml2's
default `NOBLANKS`, so `textOf` equals R's `xml_text`.

## Tests

```
npm ci && npm run typecheck && npm test
```

Regenerate the PubMed golden (needs R with xml2, data.table, jsonlite,
logging, stringi, dplyr):

```
Rscript test/golden/r/pubmed_golden.R test/fixtures/pubmed_efetch.xml > test/golden/pubmed_efetch.json
```
