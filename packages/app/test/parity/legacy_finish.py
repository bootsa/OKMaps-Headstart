"""Second half of legacy_maps.R: what the server does to vis_layout's output
before vis/ reads it, then gzips each case.

- dataprocessing (server/workers/dataprocessing/src/headstart.py on the legacy-server branch):
  pd.DataFrame(json.loads(output)).to_json(orient="records")
- PHP (server/services/search.php, legacy-server branch): json_encode, then <U+XXXX> -> &#xXXXX;

Needs pandas.
"""
import gzip
import json
import os
import re
import sys

import pandas as pd

out = sys.argv[1]
for name in sorted(os.listdir(out)):
    if not name.endswith(".raw.json"):
        continue
    case = name[: -len(".raw.json")]
    with open(os.path.join(out, name), encoding="utf-8") as f:
        raw = json.load(f)

    def finish(output):
        documents = pd.DataFrame(output).to_json(orient="records")
        php = json.dumps({"documents": documents}, ensure_ascii=False)
        php = re.sub(r"<U\+(.*?)>", r"&#x\1;", php)
        return json.loads(json.loads(php)["documents"])

    result = {"params": raw["params"], "documents": finish(raw["output"]), "documents_b": finish(raw["output_b"])}
    with gzip.open(os.path.join(out, f"{case}.json.gz"), "wt", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    os.remove(os.path.join(out, name))
    print("wrote", case, len(result["documents"]), "documents")
