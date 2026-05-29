#!/bin/bash
# lint-schema-counts.sh — Gate: every prose/test reference to the schema
# count must match the on-disk count in `frontend/lib/shared/clauses/`.
#
# Source of truth (single):
#   total   = `ls frontend/lib/shared/clauses/*.json | wc -l`
#   runtime = total - 1   (subtract figaro-topology-v1, manifest-only)
#
# Rationale: every schema add/remove silently desyncs ~10 downstream
# references — deploy-script console.logs, Foundry assertions, Rust
# conformance, doc inventories. Each becomes a stale test or doc until
# someone notices. This gate compares each known reference site against
# the on-disk count and refuses on any mismatch.
#
# Adding a new reference site: drop a new `check` line below. The lint
# is intentionally pattern-explicit — semantic parsing of prose is out
# of scope, so new claims must be opted into the gate by hand.
#
# Reword-safe by construction. The gate's only job is "no STALE number".
# A claim that isn't present can't be stale, so the two conditions are
# kept distinct:
#   - number present but WRONG  → FAILURE (the stale-count bug; exit 1)
#   - anchor phrase ABSENT      → WARNING (a reword dropped/moved the
#                                 claim; coverage degraded, not a break)
# This means rewording a tracked doc can never break a commit — at worst
# it emits a visible warning that the claim is no longer covered. To
# re-cover it, restore a phrase the anchor matches (or loosen the anchor).
# Anchors are kept as loose as is unambiguous so ordinary rewordings keep
# matching in the first place.
#
# Exit codes:
#   0 — no stale reference (warnings, if any, are non-fatal)
#   1 — at least one tracked reference is present but stale
#   2 — tooling error (schemas dir missing, topology-v1 missing)

set -u

SCHEMAS_DIR="frontend/lib/shared/clauses"

if [ ! -d "$SCHEMAS_DIR" ]; then
    echo "[schema-counts] schemas dir not found: $SCHEMAS_DIR" >&2
    exit 2
fi

total=$(ls "$SCHEMAS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$total" -eq 0 ]; then
    echo "[schema-counts] no schema specs found in $SCHEMAS_DIR" >&2
    exit 2
fi

if [ ! -f "$SCHEMAS_DIR/figaro-topology-v1.json" ]; then
    echo "[schema-counts] figaro-topology-v1.json missing — runtime-attestable count assumes it exists" >&2
    exit 2
fi

runtime=$((total - 1))

declare -a failures
declare -a warnings

# check <file> <regex> <expected> <description>
# The regex must capture exactly one trailing digit group via grep -oE.
#
# Outcomes (see header — reword-safe by construction):
#   anchor absent        → WARNING (claim reworded/removed; can't be stale)
#   number present+wrong → FAILURE (the stale-count bug)
#   number present+right → OK
check() {
    local file="$1" regex="$2" expected="$3" desc="$4"
    if [ ! -f "$file" ]; then
        return 0  # file missing — out of scope for this lint
    fi
    local match
    match=$(grep -oE "$regex" "$file" | head -1)
    if [ -z "$match" ]; then
        warnings+=("$file: count claim not found ($desc) — reworded or removed; no longer covered")
        return
    fi
    local actual
    actual=$(echo "$match" | grep -oE '[0-9]+' | head -1)
    if [ "$actual" != "$expected" ]; then
        failures+=("$file: $desc → claims $actual, expected $expected (matched: $match)")
    fi
}

# ── total count: every schema including manifest-only topology-v1 ────────────
check "script/Deploy.s.sol" \
    'Registered [0-9]+ reference schemas' \
    "$total" "Deploy.s.sol registration console.log"
check "script/DeployMainnet.s.sol" \
    'SchemaRegistry: [0-9]+ reference schemas registered' \
    "$total" "DeployMainnet registration console.log"
check "docs/v5/FRONTEND.md" \
    '[0-9]+ schemas in$' \
    "$total" "FRONTEND.md schemas-dir count"
check "CLAUDE.md" \
    '[0-9]+ protocol schemas' \
    "$total" "CLAUDE.md total claim"
check "docs/v5/SCHEMAS.md" \
    '[0-9]+ protocol schemas' \
    "$total" "SCHEMAS.md heading"

# ── runtime-attestable count: total minus topology-v1 ────────────────────────
check "script/Deploy.s.sol" \
    'Registered [0-9]+ schema validators' \
    "$runtime" "Deploy.s.sol validators console.log"
check "script/DeployMainnet.s.sol" \
    'AttestationCoordinator: [0-9]+ validators wired' \
    "$runtime" "DeployMainnet validators console.log"
check "prover/schema/tests/conformance.rs" \
    'expected [0-9]+ embedded protocol schemas' \
    "$runtime" "conformance.rs embedded count"
check "docs/v5/TESTING.md" \
    '[0-9]+ embedded canonical specs' \
    "$runtime" "TESTING.md embedded count"
check "CLAUDE.md" \
    '[0-9]+ runtime-attestable' \
    "$runtime" "CLAUDE.md runtime-attestable claim"
check "docs/v5/SCHEMAS.md" \
    '[0-9]+ runtime-attestable' \
    "$runtime" "SCHEMAS.md runtime-attestable claim"
check "prover/schema/src/embedded.rs" \
    '[0-9]+ runtime-attestable protocol schemas' \
    "$runtime" "embedded.rs doc-comment"

if [ ${#warnings[@]} -gt 0 ]; then
    echo "[schema-counts] warning — count claim(s) not found (reworded/removed, not failing):" >&2
    for w in "${warnings[@]}"; do
        echo "   $w" >&2
    done
fi

if [ ${#failures[@]} -eq 0 ]; then
    echo "[schema-counts] in sync (total=$total, runtime-attestable=$runtime)"
    exit 0
fi

echo "[schema-counts] drift — $total schemas on disk, $runtime runtime-attestable:" >&2
for f in "${failures[@]}"; do
    echo "   $f" >&2
done
exit 1
