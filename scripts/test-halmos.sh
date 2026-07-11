#!/bin/bash
# test-halmos.sh — Reproducible Halmos symbolic proofs for Figaro.
#
# Halmos symbolically executes the HalmosFigaroCore harness against the Z3
# SMT solver and proves 7 properties hold for ALL possible inputs:
#
#   HalmosFigaroCore (7 properties):
#     check_tokenConservation_afterCommit
#     check_contractSolvency_afterCommit
#     check_correctBondAmounts
#     check_resolutionPayouts             (run in isolation, see note below)
#     check_orderStatusTransition
#     check_buyerDominance_revert
#     check_cumulativeValueMonotonic
#
# The run is split into two halmos processes:
#
#   Pass 1 (6 FigaroCore properties): batched in a single halmos process.
#   Pass 2 (1 FigaroCore property, check_resolutionPayouts): fresh process.
#
# Why the split: check_resolutionPayouts exercises the full commit + resolve
# lifecycle (2 ECDSA signature recoveries, multiple keccak256 hashes, 4 ERC-20
# transfers symbolically). In isolation it proves in ~75 seconds. Batched with
# the other 6 properties in one halmos process, Z3's search path degrades
# enough that even a 10-minute per-assertion timeout can time out. Running it
# in a fresh process reliably passes under the default budget.
#
# Prerequisites (one-time):
#   brew install z3           # Z3 SMT solver (macOS)
#   pipx install halmos       # Halmos CLI (Python)
#
# Verify your environment before running:
#   which z3 halmos
#
# Usage:
#   ./scripts/test-halmos.sh
#   HALMOS_SOLVER_TIMEOUT_MS=900000 ./scripts/test-halmos.sh   # raise per-assertion timeout (ms)
#
# Exit codes:
#   0  — all 7 properties proved
#   >0 — at least one property failed or the environment is misconfigured

set -e

# ── Environment checks ─────────────────────────────────────────────────────

if ! command -v halmos >/dev/null 2>&1; then
    echo "❌ halmos not found on PATH."
    echo "   Install with: pipx install halmos"
    exit 127
fi

if ! command -v z3 >/dev/null 2>&1; then
    echo "❌ z3 not found on PATH."
    echo "   Install with: brew install z3  (macOS)"
    exit 127
fi

echo "🔎 Using:"
echo "   $(command -v halmos) — $(halmos --version 2>&1 | head -1)"
echo "   $(command -v z3)     — $(z3 --version 2>&1 | head -1)"
echo ""

# ── Configuration ──────────────────────────────────────────────────────────
# Per-assertion timeout in ms. 600000 = 10 minutes.
: "${HALMOS_SOLVER_TIMEOUT_MS:=600000}"

CORE_ARGS=(
    --contract HalmosFigaroCore
    --solver z3
    --solver-timeout-assertion "$HALMOS_SOLVER_TIMEOUT_MS"
)

# ── Pass 1: six fast properties, batched ───────────────────────────────────

echo "▶ Pass 1/2 — 6 batched FigaroCore properties (fast)"
echo ""

FOUNDRY_PROFILE=halmos halmos \
    "${CORE_ARGS[@]}" \
    --match-test '(tokenConservation|contractSolvency|correctBondAmounts|orderStatusTransition|buyerDominance|cumulativeValue)' \
    "$@"

echo ""
echo "▶ Pass 2/2 — check_resolutionPayouts (run in isolation)"
echo ""

# ── Pass 2: the one heavy property, in a fresh halmos process ──────────────

FOUNDRY_PROFILE=halmos halmos \
    "${CORE_ARGS[@]}" \
    --function check_resolutionPayouts \
    "$@"

echo ""
echo "✅ All 7 Halmos properties proved (FigaroCore)."
