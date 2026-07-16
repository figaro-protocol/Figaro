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
# Specs currently committed (25 rules total — VERIFICATION_MAP.md is the owner):
#   certora/FigaroCore.spec             — kernel state-machine invariants (8 rules)
#   certora/AttestationCoordinator.spec — role-gate + parametric Core-immutability (4 rules)
#   certora/TokenOpsVerification.spec   — FigaroCore token-flow invariants (7 rules)
#   certora/FlorinToken.spec               — supply cap + minter registry (6 rules)
#
# Conf flag note:
#   Any spec whose rules pass symbolic `bytes` (dynamic-length) to a function
#   that computes `keccak256(bytes)` MUST set `"optimistic_hashing": true` in
#   its .conf. Without it, the prover aborts every reaching rule with
#   "Trying to hash a non-constant length array". Currently applied to
#   AttestationCoordinator.conf (content → keccak256(content) in
#   _verifyInclusion). Sound for rules that don't assert specific hash values.
#
# Prerequisites (one-time):
#   pip install certora-cli        # or: pipx install certora-cli
#   export CERTORAKEY=<key>        # from https://certora.com/signup
#
# Usage:
#   ./scripts/test-certora.sh                          # run all specs
#   ./scripts/test-certora.sh FigaroCore               # run only FigaroCore.conf
#   CERTORA_WAIT=1 ./scripts/test-certora.sh <spec>    # block until the cloud verdict
#
# Exit codes:
#   0  — all invocations dispatched successfully (cloud verification may still be
#        pending; with CERTORA_WAIT=1, 0 means every rule VERIFIED)
#   >0 — a spec invocation failed locally, the environment is misconfigured, or
#        (with CERTORA_WAIT=1) the prover reported a violated rule

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
if [ -x "./scripts/lint-token-ops.sh" ]; then
    ./scripts/lint-token-ops.sh || exit $?
    echo ""
fi

# Default spec list; callers can override by passing spec basenames as args
# (e.g. ./scripts/test-certora.sh FigaroCore).
if [ "$#" -gt 0 ]; then
    SPECS=("$@")
else
    SPECS=(FigaroCore AttestationCoordinator TokenOpsVerification FlorinToken)
fi

for spec in "${SPECS[@]}"; do
    conf="certora/${spec}.conf"
    if [ ! -f "$conf" ]; then
        echo "⚠️  skipping $spec — $conf not found"
        continue
    fi
    echo "▶ Dispatching $spec ($conf)"
    certoraRun "$conf" --disable_local_typechecking ${CERTORA_WAIT:+--wait_for_results all}
    echo ""
done

echo "✅ All requested Certora specs dispatched. Check the Prover URLs above for results."
