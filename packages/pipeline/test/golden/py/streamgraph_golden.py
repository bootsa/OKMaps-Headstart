"""Streamgraph goldens: runs the old dataprocessing worker's streamgraph step
(legacy/workers/dataprocessing/src/streamgraph.py) on real map inputs and
writes input + output per case, for test/streamgraph.test.ts.

  PYTHONPATH=../../legacy/workers/dataprocessing/src \
    python test/golden/py/streamgraph_golden.py test/golden/streamgraph

Inputs: the BASE worker's timeline outputs (packages/sources goldens), the
21 known cases (BASE and PubMed) and a few made-up edge cases.
"""
import glob
import io
import traceback
import gzip
import json
import os
import sys

from streamgraph import Streamgraph

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, "../../../../.."))
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
sg = Streamgraph(loglevel="ERROR")
KEEP = ("id", "year", "subject")


def trim(metadata):
    return [{k: m.get(k) for k in KEEP} for m in metadata]


def run(name, query, metadata, method="count", n=12):
    metadata = trim(metadata)
    case = {"name": name, "query": query, "method": method, "n": n, "metadata": metadata}
    try:
        sg_data = sg.get_streamgraph_data(metadata, query, n, method)
        case["streamgraph"] = json.loads(json.dumps(sg_data))
        # pandas >= 3 reads a literal JSON string only from a buffer.
        reduced = sg.reduce_metadata_set(io.StringIO(json.dumps(metadata)), sg_data)
        case["reduced_ids"] = [str(m["id"]) for m in json.loads(reduced)]
    except Exception as e:  # the worker reports these as "error"
        case["error"] = type(e).__name__
        if os.environ.get("DEBUG"): traceback.print_exc()
    with gzip.open(os.path.join(out_dir, f"{name}.json.gz"), "wt", encoding="utf-8") as f:
        json.dump(case, f, ensure_ascii=False)
    print(name, case.get("error") or len(case["streamgraph"]["subject"]))


for path in sorted(glob.glob(os.path.join(root, "packages/sources/test/golden/base_worker/*timeline.json.gz"))):
    data = json.load(gzip.open(path))
    name = os.path.basename(path).replace(".json.gz", "")
    query = {"cancer_research": "cancer research", "digital_education": "digital education",
             "cancer_fallback": "cancer"}[next(k for k in ("cancer_research", "digital_education", "cancer_fallback") if k in name)]
    run(name, query, data["metadata"])
    run(name + "_tfidf", query, data["metadata"], method="tfidf")

for path in sorted(glob.glob(os.path.join(root, "legacy/workers/tests/knowncases/testcase*.json"))):
    case = json.load(open(path))
    metadata = json.loads(case["input_data"]["metadata"])
    if case["params"].get("service") == "pubmed":
        for m in metadata:
            m.setdefault("id", m.get("pmid"))
    name = "known_" + os.path.basename(path).replace(".json", "")
    run(name, case["params"]["q"], metadata)

edge = [
    {"id": "a", "year": "2018", "subject": "History (modern); Science; geo"},
    {"id": "b", "year": "2019-05", "subject": "history (modern); Math; "},
    {"id": "c", "year": "2019-05-01", "subject": "Science; Math; history (modern)"},
    {"id": "d", "year": "2014-01-01T00:00:00Z", "subject": "Science; Physics"},
    {"id": "e", "year": "not a year", "subject": "Science; Math"},
    {"id": "f", "year": "2016", "subject": ""},
    {"id": "g", "year": "2016", "subject": "ab"},
    {"id": "h", "year": "2021", "subject": "Physics;Math; Physics"},
    {"id": "i", "year": "2020-12-31T23:00:00-05:00", "subject": "dummy; math; physics"},
    {"id": "j", "year": "2010", "subject": "Mathematics education; dummy"},
]
run("edge_mixed", "dummy", edge)
run("edge_mixed_tfidf", "dummy", edge, method="tfidf")
run("edge_n2", "dummy", edge, n=2)
run("edge_none", "dummy", edge + [{"id": "k", "year": "2016", "subject": None}])
run("edge_empty", "dummy", [{"id": "a", "year": "2020", "subject": "x"}])
