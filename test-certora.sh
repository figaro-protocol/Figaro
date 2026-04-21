#!/bin/bash
# test-certora.sh — Reproducible Certora formal verification.
#
# Certora's prover is a paid cloud service. This script cannot run entirely
# offline — it requires:
#   1. `certora-cli` installed locally
#   2. `CERTORAKEY` env var set to a valid Certora API key
#
# The script runs each committed spec against Certora's cloud and reports
# per-spec outcome. Verification reports are returned as URLs.
#
# Specs currently committed:
#   certora/FigaroCore.spec             — kernel state-machine invariants (8 rules)
#   certora/AttestationCoordinator.spec — attestation role-gate (6 rules)
#   certora/FigToken.spec               — token ancillary spec
#   certora/StagedMerkleAirdrop.spec    — staged airdrop claim monotonicity + config immutability (3 rules)
#
# Prerequisites (one-time):
#   pip install certora-cli        # or: pipx install certora-cli
#   export CERTORAKEY=<key>        # from https://certora.com/signup
#
# Usage:
#   ./test-certora.sh                          # run all specs
#   ./test-certora.sh FigaroCore               # run only FigaroCore.conf
#
# Exit codes:
#   0  — all invocations dispatched successfully (cloud verification may still be pending)
#   >0 — a spec invocation failed locally OR the environment is misconfigured

set -e

if ! command -v certoraRun >/dev/null 2>&1; then
    echo "❌ certoraRun not found on PATH."
    echo "   Install: pip install certora-cli   (or: pipx install certora-cli)"
    exit 127
fi

if [ -z "${CERTORAKEY:-}" ]; then
    echo "❌ CERTORAKEY env var not set."
    echo "   Get a key from https://certora.com/signup"
    echo "   Then: export CERTORAKEY=<key>"
    exit 127
fi

echo "🔎 Using: $(command -v certoraRun)"
certoraRun --version 2>&1 | head -1
echo ""

# Default spec list; callers can override by passing spec basenames as args
# (e.g. ./test-certora.sh FigaroCore).
if [ "$#" -gt 0 ]; then
    SPECS=("$@")
else
    SPECS=(FigaroCore AttestationCoordinator FigToken StagedMerkleAirdrop)
fi

for spec in "${SPECS[@]}"; do
    conf="certora/${spec}.conf"
    if [ ! -f "$conf" ]; then
        echo "⚠️  skipping $spec — $conf not found"
        continue
    fi
    echo "▶ Dispatching $spec ($conf)"
    certoraRun "$conf" --disable_local_typechecking
    echo ""
done

echo "✅ All requested Certora specs dispatched. Check the Prover URLs above for results."
