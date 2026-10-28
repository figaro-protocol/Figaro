#!/usr/bin/env bash
# export-tlc-traces.sh — TLC's own behaviors of the FigaroCore model, as JSON
# a Foundry test replays.
#
# TLC runs `formal/MC.tla` (the FigaroCore model, `formal/MC.cfg`'s constants)
# in random simulation with a fixed seed and writes each behavior it walks as a
# trace file (`-simulate file=…,num=…`). This script reads those files and
# writes `test/fixtures/tlc-traces.json`: per trace, one row per step — the action it took
# (CommitRoot, CommitSub, ResolveProcess, read off the model's own counters and
# process records between two states) and the model state after it — every
# wallet, the contract's balance and every process's record. The Foundry test
# `test/core/verifier/CoreBatchEquivalenceTest.t.sol` replays each trace
# through `FigaroCore` and through `FigaroBatchVerifier` and holds both to the
# model's state and to each other (docs/VERIFICATION_MAP.md, E-13).
#
# Usage: bash scripts/export-tlc-traces.sh [seed] [traces] [depth]
#        (defaults 1, 96, 20; the committed fixture is the defaults' output)
#
# Needs java and formal/tla2tools.jar. Writes only the fixture; TLC's own trace
# files go to a temporary directory removed on exit.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED="${1:-1}"
NUM="${2:-96}"
DEPTH="${3:-20}"
OUT="$ROOT/test/fixtures/tlc-traces.json"
JAR="$ROOT/formal/tla2tools.jar"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$ROOT/formal/FigaroCore.tla" "$ROOT/formal/MC.tla" "$ROOT/formal/MC.cfg" "$WORK/"

(
    cd "$WORK"
    java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -simulate "file=$WORK/trace,num=$NUM" \
        -depth "$DEPTH" -seed "$SEED" -workers 1 -config MC.cfg MC.tla > "$WORK/tlc.log" 2>&1
) || {
    cat "$WORK/tlc.log" >&2
    exit 1
}

python3 -I - "$WORK" "$OUT" "$SEED" "$NUM" "$DEPTH" <<'PY'
import glob, json, os, re, sys

work, out, seed, num, depth = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])

# ── A reader for the TLA+ values TLC prints in a trace ──────────────────
TOKEN = re.compile(r'\s*(<<|>>|\|->|:>|@@|\[|\]|\(|\)|,|"[^"]*"|-?\d+|[A-Za-z_][A-Za-z0-9_]*)')

def tokens(text):
    pos, out_ = 0, []
    while pos < len(text):
        m = TOKEN.match(text, pos)
        if not m:
            if text[pos:].strip() == "":
                break
            raise SystemExit(f"unreadable TLA+ value at: {text[pos:pos+40]!r}")
        out_.append(m.group(1))
        pos = m.end()
    return out_

def parse(ts, i=0):
    t = ts[i]
    if t == "<<":
        items, i = [], i + 1
        while ts[i] != ">>":
            v, i = parse(ts, i)
            items.append(v)
            if ts[i] == ",":
                i += 1
        return items, i + 1
    if t == "[":
        rec, i = {}, i + 1
        while ts[i] != "]":
            k = ts[i]
            assert ts[i + 1] == "|->", ts[i:i + 3]
            v, i = parse(ts, i + 2)
            rec[k] = v
            if ts[i] == ",":
                i += 1
        return rec, i + 1
    if t == "(":
        fn, i = {}, i + 1
        while ts[i] != ")":
            k, i = parse(ts, i)
            assert ts[i] == ":>", ts[i]
            v, i = parse(ts, i + 1)
            fn[k] = v
            if ts[i] == "@@":
                i += 1
        return fn, i + 1
    if t.startswith('"'):
        return t[1:-1], i + 1
    if re.fullmatch(r"-?\d+", t):
        return int(t), i + 1
    return t, i + 1  # a model value: b1, s2

def read_states(path):
    text = open(path).read()
    states = []
    for block in re.split(r"\nSTATE_\d+ ==\s*\n", text)[1:]:
        block = block.split("\n=====")[0]
        state = {}
        for conj in re.split(r"\n?/\\ ", block)[1:]:
            name, value = conj.split(" = ", 1)
            v, _ = parse(tokens(value.strip()))
            state[name.strip()] = v
        states.append(state)
    return states

def observed(state):
    return {
        "wallets": dict(sorted(state["wallets"].items())),
        "contractBalance": state["contractBalance"],
        "processes": [
            {"rootBuyer": p["rootBuyer"], "cumulativeValue": p["cumulativeValue"], "activeCount": p["activeCount"]}
            for p in state["processes"]
        ],
    }

def action(before, after):
    """The model action that took `before` to `after`, read off its own state."""
    if after["nextProcId"] == before["nextProcId"] + 1:
        oid = before["nextOrdId"]
        o = after["orderRecords"][oid - 1]
        return {"action": "CommitRoot", "pid": o["processId"], "oid": oid, "buyer": o["buyer"],
                "seller": o["seller"], "payment": o["payment"], "cumulativeValue": o["cumulativeValue"]}
    if after["nextOrdId"] == before["nextOrdId"] + 1:
        oid = before["nextOrdId"]
        o = after["orderRecords"][oid - 1]
        return {"action": "CommitSub", "pid": o["processId"], "oid": oid, "buyer": o["buyer"],
                "seller": o["seller"], "payment": o["payment"], "cumulativeValue": o["cumulativeValue"]}
    closed = [i + 1 for i, (b, a) in enumerate(zip(before["processes"], after["processes"]))
              if b["activeCount"] > 0 and a["activeCount"] == 0]
    assert len(closed) == 1, "a step that is none of the model's three actions"
    pid = closed[0]
    return {"action": "ResolveProcess", "pid": pid, "oids": after["processOrders"][pid - 1],
            "buyer": after["processes"][pid - 1]["rootBuyer"]}

# One numeric row per step, so the Foundry replay decodes a trace in one call.
ACTIONS = {"CommitRoot": 0, "CommitSub": 1, "ResolveProcess": 2}

def row(step, parties):
    a = step["after"]
    r = [ACTIONS[step["action"]], step["pid"], parties.index(step["buyer"]),
         parties.index(step["seller"]) if "seller" in step else 0,
         step.get("payment", 0), step.get("cumulativeValue", a["processes"][step["pid"] - 1]["cumulativeValue"])]
    r += [a["wallets"][p] for p in parties]
    r.append(a["contractBalance"])
    for proc in a["processes"]:
        r += [proc["cumulativeValue"], proc["activeCount"]]
    return r

files = sorted(glob.glob(os.path.join(work, "trace_*")), key=lambda p: [int(x) for x in re.findall(r"\d+", os.path.basename(p))])
traces, seen, parties, initial = [], set(), None, None
for path in files:
    states = read_states(path)
    if len(states) < 2:
        continue
    if parties is None:
        parties = sorted(states[0]["wallets"].keys())
        initial = observed(states[0])
    steps = []
    for before, after in zip(states, states[1:]):
        step = action(before, after)
        step["after"] = observed(after)
        steps.append(step)
    rows = [row(s, parties) for s in steps]
    key = json.dumps(rows)
    if key in seen:
        continue
    seen.add(key)
    traces.append({"source": os.path.basename(path), "rows": rows})

columns = (["action (0 CommitRoot, 1 CommitSub, 2 ResolveProcess)", "pid", "buyer", "seller", "payment",
            "cumulativeValue"] + [f"wallets[{p}]" for p in parties] + ["contractBalance"]
           + [f"processes[{i + 1}].{f}" for i in range(len(initial["processes"])) for f in ("cumulativeValue", "activeCount")])
doc = {
    "model": "formal/FigaroCore.tla via formal/MC.tla + formal/MC.cfg",
    "generator": "scripts/export-tlc-traces.sh",
    "tlc": f"-simulate num={num} -depth {depth} -seed {seed} -workers 1",
    "parties": parties,
    "initialBalance": initial["wallets"][parties[0]],
    "columns": columns,
    "traceCount": len(traces),
    "traces": traces,
}
with open(out, "w") as f:
    f.write("{\n")
    head = [k for k in doc if k != "traces"]
    for k in head:
        f.write(f" {json.dumps(k)}: {json.dumps(doc[k])},\n")
    f.write(' "traces": [\n')
    f.write(",\n".join("  " + json.dumps(t, separators=(",", ":")) for t in traces))
    f.write("\n ]\n}\n")
print(f"wrote {out}: {len(traces)} distinct traces, {sum(len(t['rows']) for t in traces)} steps")
PY
