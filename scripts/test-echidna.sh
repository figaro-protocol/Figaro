#!/bin/bash
# test-echidna.sh — Reproducible Echidna property-based fuzzing.
#
# Runs two harnesses:
#   1. Figaro kernel (src/echidna/EchidnaFuzzer.sol) — 7 invariants
#        echidna_solvency                  echidna_token_conservation
#        echidna_active_count_consistent   echidna_buyer_dominance
#        echidna_cumulative_accounting     echidna_atomic_resolution
#        echidna_state_monotonicity
#
#   2. FigToken (src/echidna/EchidnaFigToken.sol) — 8 invariants
#        echidna_max_supply_never_exceeded            echidna_deployer_can_renounce
#        echidna_deployer_cannot_mint_after_renounce  echidna_minter_cap_enforced
#        echidna_no_zero_address_minter               echidna_no_mint_to_zero_address
#        echidna_total_supply_matches_balances        echidna_contract_transfer_preserves_supply
#
# All at 50,000 test limit, seqLen 30, 300s wall-clock timeout, property mode.
#
# Echidna is a random fuzzer, so call counts vary between runs. The 50,000
# testLimit is the reproducibility anchor, not raw call count.
#
# Prerequisites (one-time):
#   brew install echidna           # macOS
#   # or: https://github.com/crytic/echidna/releases
#
# Usage:
#   ./scripts/test-echidna.sh
#
# Extra CLI args are forwarded to the kernel pass only (Pass 2 pins its own
# knobs, and echidna rejects duplicate flags).
#
# Exit codes:
#   0  — all properties held across the configured fuzz budget
#   >0 — at least one property found a counterexample OR environment is misconfigured

set -e

if ! command -v echidna >/dev/null 2>&1; then
    echo "❌ echidna not found on PATH."
    echo "   Install: brew install echidna"
    echo "   Or download: https://github.com/crytic/echidna/releases"
    exit 127
fi

echo "🔎 Using: $(command -v echidna)"
echidna --version 2>&1 | head -1
echo ""

# Echidna invokes `crytic-compile` under the hood, which reads foundry.toml
# when --crytic-args specifies the Foundry backend. The `cryticArgs` field in
# echidna.yaml points at the forge `out/` directory.
echo "── Pass 1/2: Figaro kernel (EchidnaFuzzer) ──"
echidna . \
    --contract EchidnaFuzzer \
    --config echidna.yaml \
    "$@"

# The FigToken harness lives in src/echidna/ alongside the kernel harness.
# Invoked by explicit file path (not `echidna . --contract X`) so the pass
# keeps its own --workers / --timeout knobs independent of echidna.yaml.
echo ""
echo "── Pass 2/2: FigToken (EchidnaFigToken) ──"
echidna src/echidna/EchidnaFigToken.sol \
    --contract EchidnaFigToken \
    --test-limit 50000 \
    --seq-len 30 \
    --format text \
    --workers 4 \
    --timeout 300

echo ""
echo "✅ Echidna completed. Review output above for per-property results."
