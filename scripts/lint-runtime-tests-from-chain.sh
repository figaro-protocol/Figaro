#!/usr/bin/env bash
#
# lint-runtime-tests-from-chain.sh — RUNTIME E2E SPECS DISCOVER FROM CHAIN.
#
# HARD RULE (feedback_runtime_tests_discover_from_chain): a devnet/e2e spec reads
# the sellers / catalogues / orders it needs from the CHAIN + IPFS (via the
# registries), never from a hardcoded roster constant. A bundled seller list makes
# the test pass against fixture data the network never produced — the same
# closed-world drift the frontend guards forbid, one layer down.
#
# Trigger:  a `*_ROSTER` constant/identifier, or an `import … from '…roster…'`,
#           inside a `*.devnet.spec.ts`.
# Discriminator:  a ROSTER is a closed, bundled list of participants. Reading anvil
#           KEYS/ACCOUNTS (deterministic unlocked-RPC signers) is NOT a roster —
#           those are how a spec ACTS as a wallet; the seller IDENTITY/catalogue
#           must still come from chain. So `ANVIL_ACCOUNTS` / `anvilAccounts` are
#           explicitly allowed; `SELLER_ROSTER` and roster imports are not.
#
# Prophylactic ratchet — no roster exists in the suite today; this keeps it that
# way. DUAL MODE: args ⇒ check those files (pre-commit diff); no args ⇒ sweep the
# whole tracked devnet-spec set (certifies STATE, not just the diff).
#
# Exit: 0 clean, 1 on any violation.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "$#" -gt 0 ]]; then
    files="$*"
else
    files=$(git ls-files 'frontend/**/*.devnet.spec.ts' 2>/dev/null)
fi

# A bundled roster: a *_ROSTER const/identifier, or an import from a roster module.
PAT_ROSTER='\b[A-Z_]*ROSTER\b|from[[:space:]]+['"'"'"][^'"'"'"]*[Rr]oster'

violations=0
for f in $files; do
    [[ -f "$f" ]] || continue
    case "$f" in *.devnet.spec.ts) ;; *) continue ;; esac
    hits=$(grep -nE "$PAT_ROSTER" "$f" || true)
    if [[ -n "$hits" ]]; then
        echo "[runtime-tests-from-chain] $f — discovers participants from a bundled ROSTER, not the chain:"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "Runtime e2e specs read sellers/catalogues/orders from chain + IPFS (via the"
    echo "registries), never a bundled roster. Use the registry reads the canonical specs"
    echo "use (assemblyAnchored / registered-seller discovery); anvil KEYS/ACCOUNTS are for"
    echo "SIGNING only, not for sourcing participant identity. (feedback_runtime_tests_discover_from_chain)"
    exit 1
fi
exit 0
