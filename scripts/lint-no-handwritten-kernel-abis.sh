#!/usr/bin/env bash
#
# lint-no-handwritten-kernel-abis.sh — pre-commit guard: frontend code may
# NEVER hand-write a kernel/coordinator/registry ABI fragment the SDK already
# exports.
#
# The failure this guard makes permanent the fix for: a spec re-declared
# `event OrderCommitted(...)` from memory with a wrong field order — the
# topic hash matched nothing, `getContractEvents` silently returned empty,
# and a working flow read as red for hours (diagnosed as a product bug).
# A fabricated ABI never errors; it just sees nothing. The canonical
# sources are `CORE_ABI` / `ATTESTATION_COORDINATOR_ABI` /
# `CLAUSE_REGISTRY_ABI` / `SELLER_REGISTRY_ABI` / `ASSEMBLY_REGISTRY_ABI`
# from `@figaro/sdk` (the registry ABIs are complete since 2026-07-10 —
# nothing hand-rolls them), and the test-tier view export
# `CORE_PROCESS_VIEW_ABI` in `tests/e2e/devnet-helpers.ts` (the one
# sanctioned secondary home, excluded below).
#
# Scope: all frontend TypeScript + the node-side seed scripts
# (frontend/**/*.{ts,tsx,mjs}) — the 2026-07-10 layer audit found the
# fragments in lib/ readers and seeds, not only tests.
#
# Wired into the root package.json lint-staged block under
# `frontend/**/*.{ts,tsx}` and `frontend/scripts/*.mjs`. Run manually:
#   git ls-files 'frontend/**/*.ts' 'frontend/**/*.tsx' 'frontend/scripts/*.mjs' | xargs bash scripts/lint-no-handwritten-kernel-abis.sh
#
# Exit code: 0 on clean, 1 on any violation.

set -euo pipefail

# Kernel + coordinator + the three registry families; either quote style.
BANNED="[\"']event OrderCommitted\(|[\"']event ProcessResolved\(|[\"']event ProcessCreated\(|[\"']event Attestation\(|[\"']event SellerRegistered\(|[\"']event SellerProfileUpdated\(|[\"']event SellerWithdrawn\(|[\"']event ClauseRegistered\(|[\"']event DepositWithdrawn\(|[\"']event AssemblyRegistered\(|[\"']function processes\(bytes32|[\"']function commit\(|[\"']function resolveProcess\(|[\"']function registerClause\(|[\"']function registerAssembly\(|[\"']function register\(string|[\"']function registrationDeposit\("

violations=0

for file in "$@"; do
    [[ -f "$file" ]] || continue
    case "$file" in
        frontend/*.ts | frontend/**/*.ts | frontend/*.tsx | frontend/**/*.tsx | frontend/scripts/*.mjs) ;;
        *) continue ;;
    esac
    case "$file" in
        */devnet-helpers.ts) continue ;;
    esac

    hits=$(grep -nE "$BANNED" "$file" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-handwritten-abis] $file — hand-written kernel/coordinator/registry ABI fragment"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if (( violations > 0 )); then
    echo ""
    echo "[no-handwritten-abis] $violations violation(s). A fabricated ABI never errors —"
    echo "                      it just sees nothing. Import CORE_ABI /"
    echo "                      ATTESTATION_COORDINATOR_ABI / the registry ABIs from"
    echo "                      @figaro/sdk, or CORE_PROCESS_VIEW_ABI from tests/e2e/devnet-helpers."
    exit 1
fi

exit 0
