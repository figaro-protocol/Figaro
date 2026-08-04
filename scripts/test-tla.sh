#!/bin/bash
# test-tla.sh — Reproducible TLA+ model checking for Figaro kernel invariants.
#
# Runs TLC (TLA+ model checker) against four models:
#
#   1. FigaroCore kernel — via formal/MC.tla + formal/MC.cfg
#      (2 buyers, 2-3 sellers, InitialBalance 30, Payments 1-3, MaxProcesses 2,
#       MaxSubOrders 2). Verifies all 7 safety invariants exhaustively:
#        TypeOK                     CumulativeIntegrity
#        TokenConservation          ActiveCountCorrect
#        ContractSolvency           ResolutionAlwaysPossible
#        WalletNonNegative
#
#   2. FlorinToken — via formal/FlorinToken.tla + formal/FlorinToken.cfg
#      (MAX_SUPPLY=5, 3 minters, 6 recipients). Verifies 8 safety invariants:
#        Inv_MaxSupply                    Inv_NonNegative
#        Inv_DeployerCannotMintAfterRenounce  Inv_NoMintToZero
#        Inv_MinterCap                    Inv_BalancesSumToSupply
#        Inv_CapBelowMaxSupply            Inv_SupplyEqualsSumMinted
#
#   3. WitnessSwapAndCommitCoordinator — via
#      formal/WitnessSwapAndCommitCoordinator.tla + .cfg
#      (2 parties, 2 tokens, payments 1-2, 3 sequential calls; EVM-step
#       granularity with explicit revert frames, so "swap landed, commit
#       didn't" states are reachable and shown never quiescent). Verifies
#      10 safety invariants of the swap-funded on-ramp:
#        Inv_TypeOK              Inv_Atomicity
#        Inv_Conservation        Inv_BondFormula
#        Inv_NonNegative         Inv_CoreEscrowExact
#        Inv_ZeroRetention       Inv_WitnessRouteBinding
#        Inv_AllowanceHygiene    Inv_CoordinatorNotCounterparty
#
#   4. Composed settlement universes — via formal/SettlementUniverses.tla
#      + formal/SettlementUniverses.cfg (1 buyer, 2 sellers, 2 processes,
#       1 sub-order, payments 1-2, 2 artifacts one EXCLUDED, 2 periods).
#      The CROSS-CONTRACT model: FigaroCore + FigaroBatchVerifier +
#      UsageCounter + the off-chain guest kernel, under arbitrary
#      interleavings — the only harness that can see the two-settlement-
#      universes crease (Foundry/Halmos/Certora are all per-contract).
#      Verifies 24 safety invariants exhaustively: no double payout across
#      the universes; token conservation + exact per-pool escrow; usage-
#      score composition (scoreOf == direct + batch, the bridge write
#      REPLACES never adds); kernel blindness (settleBatch writes no
#      kernel orderStatus). Two NAMED assumptions are constants in the
#      .cfg — AssumeDomainSeparation (contract-enforced: EIP-712
#      verifyingContract disjointness) and AssumeAccrualGatesAligned
#      (NOT contract-enforced: a dropped batch's accrual is forgone at
#      process granularity, under-pay only). Flipping either to FALSE is
#      the experiment the model exists for and is EXPECTED to fail — do
#      not "fix" the violations those flips produce.
#
# All four models complete exhaustive state exploration in under 20 minutes
# total with -workers auto on a modern laptop.
#
# Prerequisites (one-time):
#   Java 11+ (most systems already have this: `java -version`)
#   tla2tools.jar — download once into formal/:
#
#       curl -L -o formal/tla2tools.jar \
#           https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar
#
# Override the jar location via TLA2TOOLS env var if you keep it elsewhere.
#
# Usage:
#   ./scripts/test-tla.sh
#   TLA2TOOLS=/path/to/tla2tools.jar ./scripts/test-tla.sh
#
# Exit codes:
#   0  — all 49 invariants hold across the explored state space (four models)
#   >0 — an invariant violation was found OR the environment is misconfigured

set -e

TLA2TOOLS="${TLA2TOOLS:-formal/tla2tools.jar}"

if ! command -v java >/dev/null 2>&1; then
    echo "❌ java not found on PATH. Install a JDK (11+ recommended)."
    exit 127
fi

if [ ! -f "$TLA2TOOLS" ]; then
    echo "❌ tla2tools.jar not found at '$TLA2TOOLS'"
    echo ""
    echo "   Download once with:"
    echo "     curl -L -o formal/tla2tools.jar \\"
    echo "         https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar"
    echo ""
    echo "   Or set TLA2TOOLS=/path/to/tla2tools.jar to use a different location."
    exit 127
fi

echo "🔎 Using:"
echo "   $(command -v java) — $(java -version 2>&1 | head -1)"
echo "   $TLA2TOOLS"
echo ""

# TLC is the model checker entry point inside tla2tools.jar. We cd into
# `formal/` so each model's EXTENDS clauses resolve against sibling modules
# without fragile absolute paths.
cd formal

echo "▶ Pass 1/4 — FigaroCore kernel (7 invariants)"
echo ""
java -cp "../$TLA2TOOLS" tlc2.TLC \
    -config MC.cfg \
    -workers auto \
    -cleanup \
    MC.tla \
    "$@"

echo ""
echo "▶ Pass 2/4 — FlorinToken (8 invariants)"
echo ""
java -cp "../$TLA2TOOLS" tlc2.TLC \
    -config FlorinToken.cfg \
    -workers auto \
    -cleanup \
    FlorinToken.tla \
    "$@"

echo ""
echo "▶ Pass 3/4 — WitnessSwapAndCommitCoordinator (10 invariants)"
echo ""
java -cp "../$TLA2TOOLS" tlc2.TLC \
    -config WitnessSwapAndCommitCoordinator.cfg \
    -workers auto \
    -cleanup \
    WitnessSwapAndCommitCoordinator.tla \
    "$@"

echo ""
echo "▶ Pass 4/4 — Composed settlement universes (24 invariants)"
echo ""
java -cp "../$TLA2TOOLS" tlc2.TLC \
    -config SettlementUniverses.cfg \
    -workers auto \
    -cleanup \
    SettlementUniverses.tla \
    "$@"

echo ""
echo "✅ TLA+ model-checking run finished. Review output above for invariant results."
