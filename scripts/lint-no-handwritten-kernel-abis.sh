#!/usr/bin/env bash
#
# lint-no-handwritten-kernel-abis.sh — pre-commit guard: test code may NEVER
# hand-write a kernel/coordinator ABI fragment the SDK already exports.
#
# The failure this guard makes permanent the fix for: a spec re-declared
# `event OrderCommitted(...)` from memory with a wrong field order — the
# topic hash matched nothing, `getContractEvents` silently returned empty,
# and a working flow read as red for hours (diagnosed as a product bug).
# A fabricated ABI never errors; it just sees nothing. The canonical
# sources are `CORE_ABI` / `ATTESTATION_COORDINATOR_ABI` /
# `CLAUSE_REGISTRY_ABI` from `@figaro/core`, and the test-tier view export
# `CORE_PROCESS_VIEW_ABI` in `tests/e2e/devnet-helpers.ts` (the one
# sanctioned secondary home, excluded below).
#
# Scope: frontend/tests/**/*.ts. Registry/mock surfaces the SDK does not
# export (e.g. SellerRegistry) are NOT banned — a single local
# declaration is their canonical home.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}`. Run manually:
#   git ls-files 'frontend/tests/*.ts' 'frontend/tests/**/*.ts' | xargs bash scripts/lint-no-handwritten-kernel-abis.sh
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

BANNED="'event OrderCommitted\(|'event ProcessResolved\(|'event ProcessCreated\(|'event Attestation\(|'function processes\(bytes32|'function commit\(|'function resolveProcess\("

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    case "$file" in
        frontend/tests/*.ts | frontend/tests/**/*.ts) ;;
        *) continue ;;
    esac
    case "$file" in
        */devnet-helpers.ts) continue ;;
    esac

    hits=$(grep -nE "$BANNED" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-handwritten-abis] $file — hand-written kernel/coordinator ABI fragment"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[no-handwritten-abis] $violations violation(s). A fabricated ABI never errors —"
    echo "                      it just sees nothing. Import CORE_ABI /"
    echo "                      ATTESTATION_COORDINATOR_ABI from @figaro/core, or"
    echo "                      CORE_PROCESS_VIEW_ABI from tests/e2e/devnet-helpers."
    exit 1
fi

exit 0
