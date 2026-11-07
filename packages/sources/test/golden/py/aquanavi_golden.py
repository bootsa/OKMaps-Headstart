"""AQUANAVI goldens: the old API's mapping of the mesocosm.org facility
table (legacy/workers/common/common/aquanavi/mapping.py) run on the
fixtures, for test/places.test.ts.

  PYTHONPATH=../../legacy/workers/common \
    python test/golden/py/aquanavi_golden.py test/fixtures/places test/golden/places
"""
import json
import os
import sys

import common.aquanavi.mapping as mapping

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for name in ("aquanavi", "aquanavi-edge-cases"):
    mapping.CSV_PATH_WITH_REAL_DATA = os.path.join(src, f"{name}.csv")
    docs = mapping.map_sample_data()["documents"]
    with open(os.path.join(out, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=1)
    print(name, len(docs))
