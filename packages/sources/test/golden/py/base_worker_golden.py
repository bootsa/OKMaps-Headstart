"""Golden data for the Python half of a BASE search.

Feeds the R output (test/golden/base_records/*.json.gz, the metadata JSON
run_base.R prints) through BaseClient.execute_search from
legacy/workers/base/src/base.py, with the R subprocess replaced by that
output. Duplicate merging, annotations, the list_size cut, enrichment of
journal fields and the clustering text all run as in production.

    PYTHONPATH=../../legacy/workers/common:../../legacy/workers/base/src \
      python test/golden/py/base_worker_golden.py test/golden/base_records test/golden/base_worker

Needs pandas, numpy, rapidfuzz, Levenshtein, dateparser, redis (import only).
"""
import gzip
import importlib.util
import json
import logging
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
workers = os.path.normpath(os.path.join(here, "../../../../../legacy/workers"))
spec = importlib.util.spec_from_file_location("base_worker", os.path.join(workers, "base/src/base.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

with open(os.path.join(workers, "common/common/contentproviders.json"), encoding="utf-8") as f:
    providers = {r["name"]: r["internal_name"] for r in json.load(f)}


class FakeProcess:
    def __init__(self, stdout):
        self.stdout = stdout

    def communicate(self, _input):
        return self.stdout, ""


src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
client = base.BaseClient.__new__(base.BaseClient)
client.command, client.runner, client.wd = "Rscript", "run_base.R", "."
client.logger = logging.getLogger("golden")
client.content_providers = providers

for name in sorted(os.listdir(src)):
    with gzip.open(os.path.join(src, name), "rt", encoding="utf-8") as f:
        r_output = json.load(f)
    vis_type = "timeline" if name.endswith("_timeline.json.gz") else "overview"
    stdout = json.dumps(r_output["metadata"]) + "\n[]\n"
    base.subprocess.Popen = lambda *a, **k: FakeProcess(stdout)
    # list_size 60 also exercises the cut after duplicate merging.
    for list_size in (100, 60):
        params = {"q": "golden", "service": "base", "vis_type": vis_type, "list_size": list_size, "limit": 120}
        res = client.execute_search(params)
        result = {
            "metadata": json.loads(res["input_data"]["metadata"]),
            "text": json.loads(res["input_data"]["text"]),
        }
        target = name if list_size == 100 else name.replace(".json.gz", f"_list{list_size}.json.gz")
        with gzip.open(os.path.join(out, target), "wt", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        print(target, len(result["metadata"]), "records")
