#!/bin/bash
# test-cross-impl-fuzz.sh — the differential fuzz lock between the kernel and
# its Rust mirror.
#
# Two halves under one seed:
#
#   1. Foundry (test/core/kernel/KernelDifferentialFuzzTest.t.sol) draws a
#      stream of commits and resolutions from the seed — valid ones and
#      deliberately malformed ones — runs each on FigaroCore, and writes what
#      the kernel did to cache/kernel-fuzz-stream.json.
#   2. Rust (prover/lib/tests/fuzz_stream.rs) replays the stream through the
#      mirror, one operation per batch, and must accept what the kernel
#      accepted, reject what it rejected with the same error, and arrive at
#      the same ids, deposits, payouts and process states.
#
# A divergence prints the seed and the step; the same seed reproduces it.
#
# Usage:
#   ./scripts/test-cross-impl-fuzz.sh                 # a fresh seed, 400 steps
#   ./scripts/test-cross-impl-fuzz.sh <seed>          # that seed
#   ./scripts/test-cross-impl-fuzz.sh <seed> <steps>  # that seed, that many steps
#   FUZZ_ROUNDS=8 ./scripts/test-cross-impl-fuzz.sh   # eight consecutive seeds
#
# Exit codes:
#   0  — no divergence on any round
#   >0 — a divergence, or a half that did not run

set -euo pipefail

cd "$(dirname "$0")/.."

SEED="${1:-$(date +%s)}"
STEPS="${2:-400}"
ROUNDS="${FUZZ_ROUNDS:-1}"
STREAM="$PWD/cache/kernel-fuzz-stream.json"

for ((round = 0; round < ROUNDS; round++)); do
    seed=$((SEED + round))
    echo "▶ seed $seed, $STEPS steps"

    rm -f "$STREAM"
    KERNEL_FUZZ_SEED="$seed" KERNEL_FUZZ_STEPS="$STEPS" \
        forge test --match-contract KernelDifferentialFuzzTest
    if [ ! -s "$STREAM" ]; then
        echo "❌ the Foundry half wrote no stream at $STREAM"
        exit 1
    fi

    (cd prover && KERNEL_FUZZ_STREAM="$STREAM" \
        cargo test --locked -p figaro-kernel --test fuzz_stream -- --ignored --nocapture)
done

echo "✅ The kernel and its mirror agree on every operation ($ROUNDS round(s) from seed $SEED)."
