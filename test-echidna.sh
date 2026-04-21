#!/bin/bash
# test-echidna.sh — Reproducible Echidna property-based fuzzing.
#
# Runs the 7 Figaro kernel invariants declared in src/echidna/EchidnaFuzzerV5.sol
# against the configuration in echidna-v5.yaml (50,000 test limit, seqLen 30,
# 300s wall-clock timeout, property mode).
#
#   echidna_solvency                  echidna_token_conservation
#   echidna_active_count_consistent   echidna_buyer_dominance
#   echidna_cumulative_accounting     echidna_atomic_resolution
#   echidna_state_monotonicity
#
# Echidna is a random fuzzer, so call counts vary between runs. The 50,000
# testLimit in the config is the reproducibility anchor, not raw call count.
#
# Prerequisites (one-time):
#   brew install echidna           # macOS
#   # or: https://github.com/crytic/echidna/releases
#
# Usage:
#   ./test-echidna.sh
#
# Exit codes:
#   0  — all 7 properties held across the configured fuzz budget
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
# echidna-v5.yaml points at the forge `out/` directory.
echidna . \
    --contract EchidnaFuzzerV5 \
    --config echidna-v5.yaml \
    "$@"

echo ""
echo "✅ Echidna completed. Review output above for per-property results."
