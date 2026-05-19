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
#   certora/AttestationCoordinator.spec — attestation role-gate + validator-gate + binding (7 rules)
#   certora/TokenOpsVerification.spec   — FigaroCore token-flow invariants (7 rules → 8 sub-rules)
#   certora/BatchVerifierTokenOps.spec  — FigaroBatchVerifier token-flow (single-position, 4 rules)
#   certora/FigToken.spec               — token ancillary spec
#   certora/RpgfMinter.spec             — three-stage RPGF minter (12 rules)
#
# (The StagedMerkleAirdrop spec was retired alongside the contract;
# RpgfMinter.spec is its successor — see docs/v5/AUDIT_REPORT.md for the
# retirement record and verification continuity note.)
#
# Conf flag note:
#   Any spec whose rules pass symbolic `bytes` (dynamic-length) to a function
#   that computes `keccak256(bytes)` MUST set `"optimistic_hashing": true` in
#   its .conf. Without it, the prover aborts every reaching rule with
#   "Trying to hash a non-constant length array". Currently applied to
#   AttestationCoordinator.conf (content → keccak256(content) in
#   _validateContent). Sound for rules that don't assert specific hash values.
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

# Token-ops inventory gate: every ERC20 transfer call site in src/ must be
# tracked. Runs before any cloud dispatch so a stale inventory fails fast.
if [ -x "./lint-token-ops.sh" ]; then
    ./lint-token-ops.sh || exit $?
    echo ""
fi

# Default spec list; callers can override by passing spec basenames as args
# (e.g. ./test-certora.sh FigaroCore).
if [ "$#" -gt 0 ]; then
    SPECS=("$@")
else
    SPECS=(FigaroCore AttestationCoordinator TokenOpsVerification BatchVerifierTokenOps FigToken RpgfMinter)
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
