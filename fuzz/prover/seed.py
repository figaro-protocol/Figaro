"""Write the seed corpora of the two cargo-fuzz targets from the repository's
own fixtures: the canonical clause specs in clauses/ and the streams in
test/fixtures/operation-stream-vectors.json. Run from the repository root:
python3 -I fuzz/prover/seed.py
"""

import json
import pathlib

root = pathlib.Path.cwd()
corpus = root / "fuzz" / "prover" / "corpus"

streams = corpus / "operation_stream"
streams.mkdir(parents=True, exist_ok=True)
vectors = json.loads((root / "test/fixtures/operation-stream-vectors.json").read_text())
for s in vectors["streams"]:
    (streams / f"vector-{s['name']}").write_bytes(bytes.fromhex(s["stream"][2:]))

specs = corpus / "clause_spec"
specs.mkdir(parents=True, exist_ok=True)
for path in sorted((root / "clauses").glob("*.json")):
    spec = json.loads(path.read_text())
    spec.pop("block", None)
    text = json.dumps(spec, separators=(",", ":")).encode()
    for head, name in ((0, "runtime"), (1, "reassert")):
        seed = bytes([head]) + text + b"\0{}\0{}"
        (specs / f"{path.stem}-{name}").write_bytes(seed)
