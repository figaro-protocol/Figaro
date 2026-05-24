#!/bin/bash
# Fast test script for development
# Skips the gas-ceiling test (slow under --via-ir) and uses cache

echo "🚀 Running fast test suite..."
echo ""

time forge test --via-ir --no-match-test "test_Gas_MaxOrdersResolvableUnder30MGas" "$@"

echo ""
echo "💡 Tip: Skips gas-ceiling test for speed."
echo "   Full suite: forge test --via-ir"
echo "   Specific test: ./scripts/test-fast.sh --match-test YOUR_TEST"
