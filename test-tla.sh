#!/bin/bash
# test-tla.sh — Reproducible TLA+ model checking for Figaro kernel invariants.
#
# Runs TLC (TLA+ model checker) against two models:
#
#   1. FigaroCore kernel — via formal/MC.tla + formal/MC.cfg
#      (2 buyers, 2-3 sellers, InitialBalance 30, Payments 1-3, MaxProcesses 2,
#       MaxSubOrders 2). Verifies all 7 safety invariants exhaustively:
#        TypeOK                     CumulativeIntegrity
#        TokenConservation          ActiveCountCorrect
#        ContractSolvency           ResolutionAlwaysPossible
#        WalletNonNegative
#
#   2. FigToken — via formal/FigToken.tla + formal/FigToken.cfg
#      (MAX_SUPPLY=5, 3 minters, 6 recipients). Verifies 8 safety invariants:
#        Inv_MaxSupply                    Inv_NonNegative
#        Inv_DeployerCannotMintAfterRenounce  Inv_NoMintToZero
#        Inv_MinterCap                    Inv_BalancesSumToSupply
#        Inv_CapBelowMaxSupply            Inv_SupplyEqualsSumMinted
#
# Both models complete exhaustive state exploration in under 5 minutes total
# with -workers auto on a modern laptop.
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
#   ./test-tla.sh
#   TLA2TOOLS=/path/to/tla2tools.jar ./test-tla.sh
#
# Exit codes:
#   0  — all 15 invariants hold across the explored state space (both models)
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

echo "▶ Pass 1/2 — FigaroCore kernel (7 invariants)"
echo ""
java -cp "../$TLA2TOOLS" tlc2.TLC \
    -config MC.cfg \
    -workers auto \
    -cleanup \
    MC.tla \
    "$@"

echo ""
echo "▶ Pass 2/2 — FigToken (8 invariants)"
echo ""
java -cp "../$TLA2TOOLS" tlc2.TLC \
    -config FigToken.cfg \
    -workers auto \
    -cleanup \
    FigToken.tla \
    "$@"

echo ""
echo "✅ TLA+ model-checking run finished. Review output above for invariant results."
