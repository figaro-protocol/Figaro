#!/bin/bash
# test-cross-impl-fuzz.sh — the differential fuzz across the implementations:
# the kernel against its Rust mirror; the agreement tree across the SDK, the
# Solidity library the contracts call, and the guest's verifier; the clause
# engine across the SDK and the guest.
#
# THE KERNEL STREAM — two halves under one seed:
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
# THE AGREEMENT STREAM — three legs under the same seed:
#
#   1. The SDK (sdk/tests/merkleParity.test.ts, AGREEMENT_FUZZ_SEED) generates
#      agreements of one to six sections and writes each root, leaf and
#      inclusion proof to cache/agreement-fuzz-vectors.json.
#   2. Foundry (MerkleParityTest, MERKLE_VECTORS) rebuilds every leaf the way
#      AttestationCoordinator and UsageCounter do and opens every proof with
#      OpenZeppelin MerkleProof; a tampered leaf must not open.
#   3. Rust (prover/lib/tests/merkle_parity.rs, MERKLE_VECTORS) does the same
#      through the guest's verifier.
#
# THE CLAUSE STREAM — two legs under the same seed:
#
#   1. The SDK (sdk/tests/clauses/clauseFuzzVectors.test.ts, CLAUSE_FUZZ_SEED)
#      draws cases — every protocol clause and generated specs nobody has
#      seen, some malformed; content inside the bounds and across them — and
#      writes Layer A's answers to cache/clause-fuzz-vectors.json: whether
#      the spec parses, whether the content validates, the canonical bytes.
#   2. Rust (prover/clause/tests/fuzz_vectors.rs) asks the guest's engine the
#      same three questions and must give the same answers.
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
AGREEMENTS="$PWD/cache/agreement-fuzz-vectors.json"
CLAUSES="$PWD/cache/clause-fuzz-vectors.json"

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

    rm -f "$AGREEMENTS"
    (cd sdk && AGREEMENT_FUZZ_SEED="$seed" npx vitest run tests/merkleParity.test.ts)
    if [ ! -s "$AGREEMENTS" ]; then
        echo "❌ the SDK leg wrote no agreements at $AGREEMENTS"
        exit 1
    fi
    MERKLE_VECTORS="cache/agreement-fuzz-vectors.json" \
        forge test --match-contract MerkleParityTest
    (cd prover && MERKLE_VECTORS="$AGREEMENTS" \
        cargo test --locked -p figaro-kernel --test merkle_parity)

    rm -f "$CLAUSES"
    (cd sdk && CLAUSE_FUZZ_SEED="$seed" npx vitest run tests/clauses/clauseFuzzVectors.test.ts)
    if [ ! -s "$CLAUSES" ]; then
        echo "❌ the SDK leg wrote no clause vectors at $CLAUSES"
        exit 1
    fi
    (cd prover && CLAUSE_FUZZ_VECTORS="$CLAUSES" \
        cargo test --locked -p figaro-clause --test fuzz_vectors -- --ignored --nocapture)
done

echo "✅ The implementations agree on every operation, agreement and clause case ($ROUNDS round(s) from seed $SEED)."
