# @okmaps/pipeline

The OKMaps map-building pipeline in TypeScript: from a list of papers to the
positions, areas and area titles of an overview map. It has no runtime
dependencies and uses no Node APIs, so the same code runs in a browser Web
Worker and in Node.

It is a port of the R scripts in `server/preprocessing/other-scripts` (on the
`legacy-server` branch)
(`vis_layout()` for `vis_type = "overview"`), step 1 of the plan to run OKMaps
as a browser app with a thin gateway (no R, Python, PHP, Postgres or Redis).

```ts
import { buildOverviewMap, loadDefaultResources } from "@okmaps/pipeline";

const resources = await loadDefaultResources(); // stopwords, label exclusions
const map = buildOverviewMap({ papers }, resources);
// map.documents: the papers plus x, y, area, area_uri, cluster_labels, labels
```

## What it does

| Step | R (current) | TypeScript |
| --- | --- | --- |
| Clean text, remove stopwords, stem | `create_corpus` (tm, SnowballC) | `features/corpus.ts`, `text/stem.ts` |
| Term matrix and cosine distances | `TermDocumentMatrix`, `proxy::dist` | `features/tdm.ts` |
| Ward clustering, number of areas | `hclust`, `GMD::css.hclust`, `elbow.batch` | `cluster/` |
| Layout | `vegan::metaMDS` (random restarts) | `layout/mds.ts` (deterministic) |
| Keywords for papers without any | `replace_keywords_if_empty` | `labels/keywords.ts` |
| Area titles and their casing | `create_cluster_labels` (mode 0, setting 0) | `labels/areas.ts`, `labels/casing.ts` |

## How close it is to R

Tested against R outputs in `test/golden`:

- **21 known cases** (`test/golden/cases`, from the old server's
  `workers/tests/knowncases`, BASE and PubMed):
  the stemmed corpus, the term list, the distances (to 1e-7), the merge order of
  the clustering, the explained variance, the number of areas, every paper's
  area and every keyword filled in for papers without keywords are identical
  to R's.
- **56 labelling replay fixtures** (`other-scripts/test/replay`, BASE, PubMed,
  ORCID, OpenAIRE, ITU): every area title is identical to R's.
- **Layout**: R's `metaMDS` restarts randomly, so there is no single R answer.
  The TypeScript layout starts from classical scaling and minimises the same
  stress (linear model) with SMACOF. On all 21 cases its stress is lower than
  R's, and its Procrustes distance to R's layout is 0.01 to 0.2 on most maps
  (R's own two runs differ by up to 0.97 on the unstable ones).
- `pnpm smoke:browser` builds a map inside a Web Worker in headless
  Chromium and checks it equals the Node result (about 0.3 to 0.5 s per
  120-paper map).

## Deliberate differences from R

- Only the default labelling configuration (ranking mode 0, n-gram setting 0)
  is ported; that is what production runs when `RANKING_MODE` and
  `NGRAM_SETTING` are unset. Modes 1 to 3 can be ported later if wanted.
- The layout is deterministic: the same papers always give the same map.
- A paper with no usable text gets distance 1 to every other paper. In R its
  distances are NaN and the whole map fails.
- Papers whose title gives no keywords keep an empty subject. In R the second
  pass (title + abstract) crashes in that case.
- Output keeps the input order; R sorts by id. `x`, `y` are numbers;
  `toLegacyRecords()` returns them as strings as R's JSON does.
- The timeline (streamgraph) view is not part of this package yet.

## Regenerating the goldens

The goldens were made by R scripts that ran the old server's code
(`test/golden/r/generate_goldens.R`, `convert_replay.R` and `gmd_shim.R`, with
R's tm, vegan, SnowballC and friends in the `en_US.UTF-8` locale). They were
removed with the `legacy/` folder; check out commit `ec6a09b` to run them
again.

Some R behaviours the port reproduces on purpose, because they change the results:
R's string sort is a Shell sort with locale collation (not stable, so strings
that collate equal keep a specific order), tm's `removeWords` pastes stopwords
into a regex unescaped (one French stopword, `o|`, adds an empty alternative),
and tm's SimpleCorpus counts word length in bytes.

## Streamgraph step

```ts
import { buildStreamgraph, streamgraphDocuments } from "@okmaps/pipeline/streamgraph";

const streamgraph = buildStreamgraph(papers, { query: "cancer research" }); // topN 12, method "count"
const documents = streamgraphDocuments(papers, streamgraph); // the papers in the streams
// streamgraph: { x: ["2009", ...], subject: [{ name, y, ids_timestep, ids_overall }, ...] }
```

The keyword counts per year that the streamgraph view draws (the record's
`streamgraph` field). It is a port of the old dataprocessing worker's
`Streamgraph` (`server/workers/dataprocessing/src/streamgraph.py` on the
`legacy-server` branch), which ran
for maps with `vis_type = "timeline"` instead of the layout. The subpath
`@okmaps/pipeline/streamgraph` loads only this step. The streamgraph view in
`@okmaps/ui-svelte` runs it when a record has no `streamgraph` field.

Parity: the goldens in `test/golden/streamgraph` come from the Python step run on the
BASE worker's timeline outputs, the 21 known cases and some made-up edge
cases, with the `count` and `tfidf` methods; every year, count, id list and
keyword is identical, and inputs Python rejects are rejected
(`StreamgraphError`). Kept as in Python:

- A stream counts every keyword that matches its keyword as a
  case-insensitive regular expression, so "math" also counts "mathematics
  education".
- A keyword equal to the query is left out only when the case matches.
- Dates are read as pandas reads them (time zones count in UTC; invalid
  dates and ranges such as "2017 Apr-Jun" are dropped).

Deliberate differences:

- `nmf` and `lda` are not ported (the worker imported them, but nothing set
  `sg_method` to them).
- A record without a subject line is skipped; Python failed.
- A keyword that is not a valid regular expression is matched literally;
  Python failed.
- `streamgraphDocuments` keeps PubMed's records; `reduce_metadata_set`
  read their numeric ids back as numbers and kept none.

The script that made them (`test/golden/py/streamgraph_golden.py`) was
removed with the `legacy/` folder; it is in commit `ec6a09b`.
