#!/bin/bash
# test-cross-impl-fuzz.sh — the differential fuzz across the implementations:
# FigaroCore and AttestationCoordinator against their Rust mirror; the agreement tree across the SDK, the
# Solidity library the contracts call, and the guest's verifier.
#
# THE FigaroCore STREAM — two halves under one seed:
#
#   1. Foundry (test/core/kernel/KernelDifferentialFuzzTest.t.sol) draws a
#      stream of commits, resolutions and attestations from the seed — valid
#      ones and deliberately malformed ones — runs each on FigaroCore or
#      AttestationCoordinator, and writes what the contract did to
#      test/fixtures/streams/kernel.jsonl. About half the resolutions are
#      drawn in the wallet-code form, the batch path's 0x04 entry: its bytes
#      are also read by FigaroBatchVerifier's stream reader, the oracle of the
#      entry's codec (offsets, the u16 length, the listed payments' sum), and
#      what the reader did is written beside FigaroCore's answer.
#   2. Rust (prover/lib/tests/fuzz_stream.rs) replays the stream through the
#      mirror, one operation per batch, each attestation with the
#      clauseData hash and inclusion proof the coordinator takes, and each
#      wallet-code resolution as ResolveByWalletCode, whose
#      bytes its encoder and decoder must write and read as the reader did,
#      and must accept what the contracts accepted, reject what they
#      rejected with the same error, emit the coordinator's attestation log
#      bytes, and arrive at the same ids, deposits, payouts and process
#      states.
#
# THE AGREEMENT STREAM — three legs under the same seed:
#
#   1. The SDK (sdk/tests/merkleParity.test.ts, AGREEMENT_FUZZ_SEED) generates
#      agreements of one to six clauses and writes each root, leaf and
#      inclusion proof to test/fixtures/streams/agreements.json.
#   2. Foundry (MerkleParityTest, MERKLE_VECTORS) rebuilds every leaf the way
#      AttestationCoordinator and UsageCounter do and opens every proof with
#      OpenZeppelin MerkleProof; a tampered leaf must not open.
#   3. Rust (prover/lib/tests/merkle_parity.rs, MERKLE_VECTORS) does the same
#      through the guest's verifier.
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
STREAM="$PWD/test/fixtures/streams/kernel.jsonl"
AGREEMENTS="$PWD/test/fixtures/streams/agreements.json"

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
    MERKLE_VECTORS="test/fixtures/streams/agreements.json" \
        forge test --match-contract MerkleParityTest
    (cd prover && MERKLE_VECTORS="$AGREEMENTS" \
        cargo test --locked -p figaro-kernel --test merkle_parity)
done

echo "✅ The implementations agree on every operation and agreement ($ROUNDS round(s) from seed $SEED)."
