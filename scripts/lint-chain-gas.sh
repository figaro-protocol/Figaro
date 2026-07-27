#!/bin/bash
# lint-chain-gas.sh — Gate: the per-order gas constants in
# sdk/src/gasCeilings.ts (the canonical TS home; the frontend's
# chainGasCeilings.ts is a re-export) must byte-match the Foundry
# anchor constants in test/kernel/GasCeilingTest.t.sol.
#
# Source of truth is the Foundry test — that's where the empirical
# measurement happens (binary-search of max orders that fit in 30M
# gas). The TS module reads those constants to derive chain-aware
# per-process and per-block ceilings; the lint asserts both copies
# stay locked.
#
# Without this gate, a per-order regression caught only by the Foundry
# test would never make its way into the TS publish-time check, and
# the runtime would silently accept assemblies that can't resolve
# atomically on the target chain.
#
# Exit codes:
#   0 — both copies agree
#   1 — at least one constant diverges
#   2 — tooling error (file missing, regex failed to match)

set -u

TS_FILE="sdk/src/gasCeilings.ts"
SOL_FILE="test/kernel/GasCeilingTest.t.sol"

if [ ! -f "$TS_FILE" ]; then
    echo "[chain-gas] TS module not found: $TS_FILE" >&2
    exit 2
fi
if [ ! -f "$SOL_FILE" ]; then
    echo "[chain-gas] Foundry test not found: $SOL_FILE" >&2
    exit 2
fi

# extract <file> <const_name> — pulls the underscored integer literal
# `<const> = 14_000n` (TS) or `<const> = 14_000;` (Solidity).
extract() {
    local file="$1" name="$2"
    grep -oE "${name}[[:space:]]*=[[:space:]]*[0-9_]+" "$file" \
        | head -1 \
        | grep -oE '[0-9_]+$' \
        | tr -d '_'
}

declare -a failures
check() {
    local name="$1"
    local ts_val sol_val
    ts_val=$(extract "$TS_FILE" "$name")
    sol_val=$(extract "$SOL_FILE" "$name")
    if [ -z "$ts_val" ]; then
        failures+=("$TS_FILE: $name not found")
        return
    fi
    if [ -z "$sol_val" ]; then
        failures+=("$SOL_FILE: $name not found")
        return
    fi
    if [ "$ts_val" != "$sol_val" ]; then
        failures+=("$name diverges: TS=$ts_val, Solidity=$sol_val")
    fi
}

check "RESOLVE_GAS_PER_ORDER"
check "COMMIT_GAS_PER_ORDER"

if [ ${#failures[@]} -eq 0 ]; then
    echo "[chain-gas] in sync (RESOLVE_GAS_PER_ORDER + COMMIT_GAS_PER_ORDER)"
    exit 0
fi

echo "[chain-gas] drift between TS and Foundry per-order constants:" >&2
for f in "${failures[@]}"; do
    echo "   $f" >&2
done
echo "" >&2
echo "If the Foundry assertion has tightened (real cost regression), bump both" >&2
echo "constants in lockstep. If the TS is wrong, just update the TS." >&2
exit 1
