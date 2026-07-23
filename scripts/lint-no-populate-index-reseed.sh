#!/usr/bin/env bash
#
# lint-no-populate-index-reseed.sh — DEVNET SEED-ISOLATION FLOOR.
#
# The persisted devnet is SHARED world-state across specs, and
# seedRegisteredSeller FULL-REPLACES a profile. populate-test-data.mjs owns
# anvil indices 5-12 (Kiosk 5, Aurora 6, Rosa's 7, Cardinal 8, Saffron 9,
# Pomodoro 10, Harbor 11, Sterling 12) — specs ADOPT those read-only. A spec
# that SELF-SEEDS a 5-12 index stomps the shared catalogue, and every adopter
# breaks (non-self-healing: adopters never re-seed). This masquerades as a pass
# under alphabetical suite ordering and detonates on any out-of-order run — it
# cost real debugging 2026-07-23. Dedicated self-seed indices are 22+
# (reference_e2e_wallet_index_allocation).
#
# FAIL — a private KEY of a populate index reaching a seed call: `ANVIL_KEYS[5]`
# .. `ANVIL_KEYS[12]` anywhere in a *.devnet.spec.ts (the key is used ONLY to
# sign/seed — adopting a populate seller uses its ADDRESS via ANVIL_ACCOUNTS /
# mnemonicToAccount(...).address, never its key). The minter is ANVIL_KEYS[0]
# (index 0, not populate) and is allowed.
#
# Scope: tracked frontend/tests/e2e/*.devnet.spec.ts. Exit 0 clean, 1 on any hit.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# A populate-index private key: ANVIL_KEYS[5..12].
PAT='ANVIL_KEYS\[(5|6|7|8|9|10|11|12)\]'

files=$(git ls-files 'frontend/tests/e2e/*.devnet.spec.ts' 2>/dev/null |
    grep -vE '^archive-|/archive-|node_modules')

violations=0
for f in $files; do
    [[ -f "$f" ]] || continue
    hits=$(grep -nE "$PAT" "$f" || true)
    if [[ -n "$hits" ]]; then
        echo "[no-populate-index-reseed] $f — self-seeds a populate-owned seller (5-12):"
        echo "$hits" | sed 's/^/    /'
        violations=$((violations + 1))
    fi
done

if [[ "$violations" -gt 0 ]]; then
    echo ""
    echo "populate-test-data.mjs owns anvil indices 5-12 — ADOPT those sellers by"
    echo "ADDRESS (read-only), never re-seed them by KEY (a full profile replace"
    echo "stomps every adopter). Give the spec a DEDICATED index 22+ and bump"
    echo "--accounts if needed (reference_e2e_wallet_index_allocation)."
    exit 1
fi
exit 0
