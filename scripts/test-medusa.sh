#!/bin/bash
# test-medusa.sh — Coverage-guided fuzzing with Medusa over the Echidna harnesses.
#
# Runs the same two harnesses and the same properties as scripts/test-echidna.sh:
#   1. FigaroCore (src/echidna/EchidnaFuzzer.sol) — 7 invariants
#        echidna_solvency                  echidna_token_conservation
#        echidna_active_count_consistent   echidna_buyer_dominance
#        echidna_cumulative_accounting     echidna_atomic_resolution
#        echidna_state_monotonicity
#
#   2. FlorinToken (src/echidna/EchidnaFlorinToken.sol) — 8 invariants
#        echidna_max_supply_never_exceeded            echidna_deployer_can_renounce
#        echidna_deployer_cannot_mint_after_renounce  echidna_minter_cap_enforced
#        echidna_no_zero_address_minter               echidna_no_mint_to_zero_address
#        echidna_total_supply_matches_balances        echidna_contract_transfer_preserves_supply
#
# medusa.json mirrors echidna.yaml: property mode on the `echidna_` prefix,
# sequences of 30 calls, deployer 0x30000, senders 0x10000/0x20000/0x30000,
# the HEVM cheatcodes the harness signs with (sign, addr, prank). Medusa runs
# by wall clock: 900s for Pass 1 (medusa.json), 300s for Pass 2.
# Coverage reports (HTML and LCOV) land in medusa/corpus/coverage/.
#
# Prerequisites (one-time):
#   go install github.com/crytic/medusa@v1.5.1
#   # crytic-compile (pip) is the compilation platform, as for Echidna
#
# Usage:
#   ./scripts/test-medusa.sh
#
# Extra CLI args are forwarded to the FigaroCore pass only (for example
# `--timeout 60` for a short run).
#
# Exit codes:
#   0  — all properties held across the run
#   >0 — at least one property failed OR the environment is misconfigured

set -e

MEDUSA="$(command -v medusa || true)"
if [ -z "$MEDUSA" ] && command -v go >/dev/null 2>&1; then
    candidate="$(go env GOPATH)/bin/medusa"
    [ -x "$candidate" ] && MEDUSA="$candidate"
fi
if [ -z "$MEDUSA" ]; then
    echo "❌ medusa not found on PATH or in \$(go env GOPATH)/bin."
    echo "   Install: go install github.com/crytic/medusa@v1.5.1"
    exit 127
fi

echo "🔎 Using: $MEDUSA"
"$MEDUSA" --version 2>&1 | head -1
echo ""

echo "── Pass 1/2: FigaroCore (EchidnaFuzzer) ──"
"$MEDUSA" fuzz --config medusa.json "$@"

echo ""
echo "── Pass 2/2: FlorinToken (EchidnaFlorinToken) ──"
"$MEDUSA" fuzz --config medusa.json \
    --target-contracts EchidnaFlorinToken \
    --corpus-dir medusa/corpus-florin \
    --timeout 300

echo ""
echo "✅ Medusa completed. Review output above for per-property results."
