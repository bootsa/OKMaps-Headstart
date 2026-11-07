# legacy

Parts of the old server, kept only so the TypeScript packages can be checked
against it. Nothing here runs in the app or the gateway.

| Folder | Used by |
|---|---|
| `preprocessing/other-scripts` (R) and `preprocessing/resources` | the pipeline and source goldens (`packages/pipeline/test/golden/r`, `packages/sources/test/golden/r`) and the parity check (`apps/frontend/test/parity/legacy_maps.R`); the scripts the TypeScript ports cite (`metrics.R`, `run_*.R`) are kept as their reference; `other-scripts/test/replay` holds the labelling replay fixtures and `test/queries.csv` the BASE query goldens' queries |
| `workers/base/src`, `workers/common/common` (Python) | the BASE worker golden (`packages/sources/test/golden/py/base_worker_golden.py`); `common/aquanavi` the place source goldens (`aquanavi_golden.py`); `contentproviders.json` is also read by the BASE tests |
| `workers/dataprocessing/src/streamgraph.py` (Python) | the streamgraph goldens (`packages/pipeline/test/golden/py/streamgraph_golden.py`) |
| `workers/base/renv.lock` | the rbace version the BASE goldens pin |
| `workers/tests/knowncases` | the 21 known cases the pipeline tests run |

The whole old server (PHP services, R and Python workers, Postgres, Redis,
Docker setup, examples and end-to-end tests) is on the
[`legacy-server`](https://github.com/bootsa/OKMaps-Headstart/tree/legacy-server) branch.
