#!/usr/bin/env bash
#
# lint-no-hardcoded-clauses-in-runtime.sh — pre-commit guard that keeps the
# runtime ORCHESTRATOR surface clause-agnostic.
#
# The principle (CLAUDE.md; [[feedback_schemas_are_the_contract_meaning]],
# [[feedback_state_from_events]], [[feedback_network_is_ssot]]): the agreement
# JSON — pinned to IPFS, anchored on-chain, every data input merkle-proven — IS
# the source. The frontend hardcodes only the bare-bones builder
# (`lib/semantic/deriveProcessModelFromRuntime`), which reads the clauses + their
# proven data and emits capabilities; the order page renders those capabilities
# generically (`CapabilityRail`) and names NO clause. Add a clause → it surfaces
# because the JSON carries it, with no edit to the page. That is what
# decentralized + event-driven + permissionless requires.
#
# This rule has regressed repeatedly (merchant/courier/proximity welded into
# OrderTimelineView, the core commit folded into a merchant "received" stage).
# Memories advise; this guard enforces — it stops the next agent at commit.
#
# Scope: the runtime orchestrator surface ONLY — `app/(app)/orders/`. The
# builder (`lib/semantic/`), the clause hooks (`lib/mechanisms/`), and a
# clause's own module may name themselves; the orchestrator page may not.
#
# Two generic, clause-agnostic checks (a page that gates on a specific clause
# cannot avoid one of these):
#
#   1. CLAUSE-ID LITERAL — `figaro-<name>-v<n>` anywhere in the file.
#   2. CLAUSE-ID/KEY CONSTANT — a reference ending in `_CLAUSE_ID` or
#      `_CLAUSE_KEY` (e.g. MERCHANT_PROCESS_CLAUSE_ID, PROXIMITY_POLICY_CLAUSE_KEY).
#
# Both are generic: a clause added next year is caught without touching this
# guard.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run via `bash scripts/lint-no-hardcoded-clauses-in-runtime.sh`.
#
# Run manually:
#   bash scripts/lint-no-hardcoded-clauses-in-runtime.sh path/to/file.tsx [...]
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

# Orchestrator surface: anything under the orders route group's component tree.
# (Path uses the (app) route group; match on the substring so the literal
# parens don't need escaping in every caller.)
RUNTIME_SURFACE_GLOB='app/(app)/orders/'

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.ts || "$file" == *.tsx ]] || continue
    [[ "$file" == *"$RUNTIME_SURFACE_GLOB"* ]] || continue

    # Check 1: clause-id literal (figaro-<name>-v<n>).
    hits=$(grep -nE 'figaro-[a-z0-9-]+-v[0-9]+' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-hardcoded-clauses] $file hardcodes a clause-id literal"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi

    # Check 2: clause-id/key constant reference.
    hits=$(grep -nE '[A-Z][A-Z0-9_]*_CLAUSE_(ID|KEY)\b' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-hardcoded-clauses] $file references a clause-id/key constant"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[no-hardcoded-clauses] $violations violation(s) in the runtime orchestrator surface."
    echo "The order page must name NO clause. Surface the requirement from the agreement"
    echo "JSON via the builder (deriveProcessModelFromRuntime) → a capability → CapabilityRail."
    echo "Clause-specific code belongs in the builder or the clause's own module, not the page."
    exit 1
fi

exit 0
