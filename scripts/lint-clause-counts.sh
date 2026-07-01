#!/bin/bash
# lint-clause-counts.sh — Gate: every prose/test reference to the clause
# count must match the on-disk count in `clauses/` (the canonical Layer-A
# specs / ClauseRegistry seed data; nothing bundles a copy — every consumer
# loads them from ClauseRegistry → IPFS at runtime).
#
# Source of truth (single):
#   total   = `ls clauses/*.json | wc -l`
#   runtime = total - 1   (subtract figaro-topology, agreement-only)
#
# Rationale: every clause add/remove silently desyncs ~10 downstream
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
#   2 — tooling error (clauses dir missing, topology missing)

set -u

CLAUSES_DIR="clauses"

if [ ! -d "$CLAUSES_DIR" ]; then
    echo "[clause-counts] clauses dir not found: $CLAUSES_DIR" >&2
    exit 2
fi

total=$(ls "$CLAUSES_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$total" -eq 0 ]; then
    echo "[clause-counts] no clause specs found in $CLAUSES_DIR" >&2
    exit 2
fi

# Agreement-only clauses: committed via agreementHash at signing, never
# re-asserted as a runtime attestation, so they are NOT runtime-attestable.
# There is no single stored JSON flag for this (the property is derived — no
# attestation surface), so the enumerable set is named here explicitly:
#   - figaro-topology         — the DAG is reconstructed off-chain by indexers.
#   - figaro-descending-auction — a composition marker; the auction executes on
#                                 the composed DutchAuction contract (events),
#                                 not via AttestationCoordinator.
AGREEMENT_ONLY=("figaro-topology" "figaro-descending-auction")
for c in "${AGREEMENT_ONLY[@]}"; do
    if [ ! -f "$CLAUSES_DIR/$c.json" ]; then
        echo "[clause-counts] $c.json missing — runtime-attestable count assumes the agreement-only set exists" >&2
        exit 2
    fi
done

runtime=$((total - ${#AGREEMENT_ONLY[@]}))

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

# ── total count: every clause including agreement-only topology ────────────
# NB: the deploy scripts register neither clause CONTENT (that moved to
# populate-clauses.mjs) nor per-clause validators (on-chain clause-content
# validation was removed in the proof-apparatus teardown), so they carry no
# clause-count console.log to track here.
check "docs/v5/FRONTEND.md" \
    '[0-9]+ protocol clauses on the devnet' \
    "$total" "FRONTEND.md clauses-dir count"
check "CLAUDE.md" \
    '[0-9]+ protocol clauses' \
    "$total" "CLAUDE.md total claim"
check "docs/v5/CLAUSES.md" \
    '[0-9]+ protocol clauses' \
    "$total" "CLAUSES.md heading"

# ── runtime-attestable count: total minus agreement-only topology ──────────
# "runtime-attestable" = clauses that can carry a runtime attestation (merkle-
# gated, no on-chain content validator); topology is agreement-only.
check "CLAUDE.md" \
    '[0-9]+ runtime-attestable' \
    "$runtime" "CLAUDE.md runtime-attestable claim"
check "docs/v5/CLAUSES.md" \
    '[0-9]+ runtime-attestable' \
    "$runtime" "CLAUSES.md runtime-attestable claim"

if [ ${#warnings[@]} -gt 0 ]; then
    echo "[clause-counts] warning — count claim(s) not found (reworded/removed, not failing):" >&2
    for w in "${warnings[@]}"; do
        echo "   $w" >&2
    done
fi

if [ ${#failures[@]} -eq 0 ]; then
    echo "[clause-counts] in sync (total=$total, runtime-attestable=$runtime)"
    exit 0
fi

echo "[clause-counts] drift — $total clauses on disk, $runtime runtime-attestable:" >&2
for f in "${failures[@]}"; do
    echo "   $f" >&2
done
exit 1
