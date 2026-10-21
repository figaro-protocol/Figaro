#!/bin/bash
# test-halmos.sh — Reproducible Halmos symbolic proofs for Figaro.
#
# Halmos symbolically executes the harnesses against the Z3 SMT solver and
# proves 41 properties hold for ALL possible inputs: 7 HalmosFigaroCore +
# 7 HalmosMembersRegistry + 9 HalmosUsageCounter + 6 HalmosClauseRegistry +
# 6 HalmosAssemblyRegistry + 6 HalmosAgreementRegistry.
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
#   0  — all 41 properties proved
#   >0 — at least one property failed or the environment is misconfigured

set -e

# ── A pass that proved nothing is a failure ────────────────────────────────
# Halmos exits 0 and prints "No tests" when its artifacts lack the compiler AST
# (nothing matched or nothing loaded). Every pass goes through run_halmos, which
# fails on that line whatever the exit code.
: "${HALMOS_BIN:=halmos}"
run_halmos() {
    local log status
    log=$(mktemp)
    FOUNDRY_PROFILE=halmos "$HALMOS_BIN" "$@" 2>&1 | tee "$log"
    status=${PIPESTATUS[0]}
    if [ "$status" -eq 0 ] && grep -q 'No tests' "$log"; then
        echo "❌ halmos printed \"No tests\": the pass proved nothing (artifacts without the compiler AST? run: FOUNDRY_PROFILE=halmos forge build --force)."
        status=1
    fi
    rm -f "$log"
    return "$status"
}

if [ "${1:-}" = "--self-test" ]; then
    tmp=$(mktemp -d)
    printf '#!/bin/sh\necho "No tests found"\nexit 0\n' > "$tmp/fake-empty"
    printf '#!/bin/sh\necho "[PASS] check_x"\nexit 0\n' > "$tmp/fake-ok"
    chmod +x "$tmp/fake-empty" "$tmp/fake-ok"
    if HALMOS_BIN="$tmp/fake-empty" run_halmos >/dev/null 2>&1; then
        echo "[test-halmos] self-test: a pass printing \"No tests\" exited 0 — FAIL"; rm -rf "$tmp"; exit 1
    fi
    if ! HALMOS_BIN="$tmp/fake-ok" run_halmos >/dev/null 2>&1; then
        echo "[test-halmos] self-test: a passing run failed — FAIL"; rm -rf "$tmp"; exit 1
    fi
    rm -rf "$tmp"
    echo "[test-halmos] self-test: \"No tests\" fails the pass, a real pass stands — ok"
    exit 0
fi

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

echo "▶ Pass 1/7 — 6 batched FigaroCore properties (fast)"
echo ""

run_halmos \
    "${CORE_ARGS[@]}" \
    --match-test '(tokenConservation|contractSolvency|correctBondAmounts|orderStatusTransition|buyerDominance|cumulativeValue)' \
    "$@"

echo ""
echo "▶ Pass 2/7 — check_resolutionPayouts (run in isolation)"
echo ""

# ── Pass 2: the one heavy property, in a fresh halmos process ──────────────

run_halmos \
    "${CORE_ARGS[@]}" \
    --function check_resolutionPayouts \
    "$@"

echo ""
echo "▶ Pass 3/7 — MembersRegistry: the state machine the designer-rewards Sybil bound rests on"
echo ""

# ── Pass 3: the stake mechanics the economic bound assumes ────────────────
#
# The Sybil price `deposit · N · T / P` is a PAPER claim. These prove it is a
# claim about THIS contract: solvency (the deposit is a stake, not a fee),
# no deposit recycling (or the `N` term vanishes), de-surfacing at request
# time (or the `T` term does), and that the counter reads exactly that gate
# (an unread gate prices nothing). What they do NOT prove is that the deposit
# is big enough — that stays paper work.

run_halmos \
    --contract HalmosMembersRegistry \
    --solver z3 \
    --solver-timeout-assertion "$HALMOS_SOLVER_TIMEOUT_MS" \
    "$@"

echo ""
echo "▶ Pass 4/7 — UsageCounter: the accrual ARITHMETIC on top of the (already proved) stake gate"
echo ""

# ── Pass 4: the two-resolution-universes accounting ────────────────────────
#
# Direct-path accrual never regresses; the batch write REPLACES cumulative
# (c,d), never adds; scoreOf == accrualOf.score + batchAccrualOf.score (the
# ONLY place the two resolution universes meet); every timestamp buckets into
# exactly its period window; clause A's record never touches clause B; one
# kind's accrual never touches another kind's at the same key, and an unknown
# kind is skipped.
# The stake GATE itself is Pass 3's job (E-5) — not re-proved here.

run_halmos \
    --contract HalmosUsageCounter \
    --solver z3 \
    --solver-timeout-assertion "$HALMOS_SOLVER_TIMEOUT_MS" \
    "$@"

echo ""
echo "▶ Pass 5/7 — ClauseRegistry: the stake machine designer-of-record eligibility reads"
echo ""

# ── Passes 5, 6 + 7: the clause, assembly and agreement registry stake machines ──
#
# MembersRegistry's siblings minus the cooldown: solvency under arbitrary
# interleavings, first-write-wins permanence, one-shot withdrawal, eligibility
# ends at withdraw with nothing restoring it, cross-key isolation. These
# stakes are held-at-claim for RpgfMinter._isAuthor, so their state machines
# carry the designer half of the Sybil bound.

run_halmos \
    --contract HalmosClauseRegistry \
    --solver z3 \
    --solver-timeout-assertion "$HALMOS_SOLVER_TIMEOUT_MS" \
    "$@"

echo ""
echo "▶ Pass 6/7 — AssemblyRegistry: the same stake machine, compositionHash-keyed"
echo ""

run_halmos \
    --contract HalmosAssemblyRegistry \
    --solver z3 \
    --solver-timeout-assertion "$HALMOS_SOLVER_TIMEOUT_MS" \
    "$@"

echo ""
echo "▶ Pass 7/7 — AgreementRegistry: the same stake machine, agreementHash-keyed"
echo ""

run_halmos \
    --contract HalmosAgreementRegistry \
    --solver z3 \
    --solver-timeout-assertion "$HALMOS_SOLVER_TIMEOUT_MS" \
    "$@"

echo ""
echo "✅ All 41 Halmos properties proved (7 FigaroCore + 7 MembersRegistry + 9 UsageCounter + 6 ClauseRegistry + 6 AssemblyRegistry + 6 AgreementRegistry)."
