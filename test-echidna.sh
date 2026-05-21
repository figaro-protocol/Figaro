#!/bin/bash
# test-echidna.sh — Reproducible Echidna property-based fuzzing.
#
# Runs three harnesses:
#   1. Figaro kernel (src/echidna/EchidnaFuzzer.sol) — 7 invariants
#        echidna_solvency                  echidna_token_conservation
#        echidna_active_count_consistent   echidna_buyer_dominance
#        echidna_cumulative_accounting     echidna_atomic_resolution
#        echidna_state_monotonicity
#
#   2. RpgfMinter (echidna/EchidnaRpgfMinter.sol) — 8 invariants
#        echidna_claim_flag_monotonic      echidna_total_minted_within_cap
#        echidna_minter_immutable          echidna_submitter_immutable
#        echidna_program_vkey_immutable    echidna_unlock_times_immutable
#        echidna_root_one_shot             echidna_claim_balance_consistency
#
#   3. FigToken (echidna/EchidnaFigToken.sol) — 8 invariants
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
#   ./test-echidna.sh
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
echo "── Pass 1/3: Figaro kernel (EchidnaFuzzer) ──"
echidna . \
    --contract EchidnaFuzzer \
    --config echidna.yaml \
    "$@"

# RpgfMinter and FigToken live outside forge's `src/` tree, so crytic-compile
# is given the file path directly. Same testLimit / seqLen / timeout for parity.
echo ""
echo "── Pass 2/3: RpgfMinter (EchidnaRpgfMinter) ──"
echidna echidna/EchidnaRpgfMinter.sol \
    --contract EchidnaRpgfMinter \
    --test-limit 50000 \
    --seq-len 30 \
    --format text \
    --workers 4 \
    --timeout 300 \
    "$@"

echo ""
echo "── Pass 3/3: FigToken (EchidnaFigToken) ──"
echidna echidna/EchidnaFigToken.sol \
    --contract EchidnaFigToken \
    --test-limit 50000 \
    --seq-len 30 \
    --format text \
    --workers 4 \
    --timeout 300 \
    "$@"

echo ""
echo "✅ Echidna completed. Review output above for per-property results."
