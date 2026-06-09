#!/usr/bin/env bash
#
# lint-no-clause-names.sh — HARD guard: generic code may NEVER name a clause.
#
# NO ALLOWLIST, BY DESIGN. An allowlist would PERMIT named clauses in listed
# files — it institutionalizes the closed-world code this guard exists to forbid.
# The protocol is PERMISSIONLESS: anyone can register a clause to the
# ClauseRegistry with zero code changes, so the set of clauses is OPEN and
# defined by the network at runtime, never by the code. Generic code must operate
# on the SPEC (chain -> IPFS), never on a clause's identity.
#
# THE TEST every line must pass: "Would this still work if a clause the codebase
# has NEVER seen were dropped into the registry right now?" If a line names a
# clause, the answer is no — and that line is the bug. This guard stops it at the
# commit.
#
# Forbidden, in any STAGED .ts/.tsx under frontend/{lib,components,app/(app)}:
#   1. a clause-id LITERAL:   figaro-<name>-v<n>   (e.g. "figaro-merchant-process-v1")
#   2. a clause KEY/ID SYMBOL: *_CLAUSE_KEY / *_CLAUSE_ID  (e.g. MERCHANT_PROCESS_CLAUSE_KEY)
#
# Out of scope (these legitimately reference clauses): (marketing) pages + papers
# (prose describing the protocol), and *.json (the clause specs / fixtures
# themselves). app-state localStorage keys like "figaro-onboarding-shown" carry
# no -v<n> suffix and so never match check 1.
#
# Wired into the root package.json lint-staged block under frontend/**/*.{ts,tsx}.
# Run manually:  bash scripts/lint-no-clause-names.sh path/to/file.ts [...]
# Exit code: 0 clean, 1 on any violation.

set -euo pipefail

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    [[ "$file" == *.ts || "$file" == *.tsx ]] || continue

    # Scope: generic frontend code only.
    case "$file" in
        *"frontend/lib/"*|*"frontend/components/"*|*"frontend/app/(app)/"*) ;;
        *) continue ;;
    esac
    # Out of scope: marketing prose, papers, JSON specs/fixtures.
    case "$file" in
        *"(marketing)"*|*"/papers/"*|*.json) continue ;;
    esac

    hits=$(grep -nE 'figaro-[a-z0-9-]+-v[0-9]+|[A-Z_]+_CLAUSE_(KEY|ID)\b' "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-clause-names] $file names a clause by IDENTITY (closed-world — forbidden):"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "Generic code must read each clause's SPEC from the registry (chain -> IPFS),"
    echo "never branch on a clause's identity. A permissionless clause that anyone"
    echo "registers must flow drawer -> encode -> commit -> runtime with ZERO code changes."
    echo "Remove the clause name(s) above before committing this file."
    exit 1
fi

exit 0
