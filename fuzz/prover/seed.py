"""Write the seed corpus of the cargo-fuzz target from the repository's own
fixture: the streams in test/fixtures/operation-stream-vectors.json. Run from
the repository root:
python3 -I fuzz/prover/seed.py
"""

import json
import pathlib

root = pathlib.Path.cwd()
streams = root / "fuzz" / "prover" / "corpus" / "operation_stream"
streams.mkdir(parents=True, exist_ok=True)
vectors = json.loads((root / "test/fixtures/operation-stream-vectors.json").read_text())
for s in vectors["streams"]:
    (streams / f"vector-{s['name']}").write_bytes(bytes.fromhex(s["stream"][2:]))
