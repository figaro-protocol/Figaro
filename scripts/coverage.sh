#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# forge 1.5.1 runs coverage on the legacy code generator's un-optimized build whatever
# FOUNDRY_PROFILE=coverage says (it prints "optimizer settings and viaIR have been
# disabled"); --ir-minimum is not passed either, because under coverage's shadow
# counters the minimal-optimization IR build fails stack-too-deep in
# FigaroBatchVerifier._decodePV. The sources therefore keep every function within the
# legacy build's stack (the batch verifier's resolve entry sums the listed payments in a
# helper of its own for that reason).
#
# Five gas-anchor tests are excluded: their assertions are calibrated for
# non-instrumented bytecode, and coverage's shadow counters raise per-call gas.
# test_Gas_resolveExecutionMarginal (GasCeilingTest) checks the warm resolve-loop
# marginal stays below RESOLVE_GAS_PER_ORDER (23,000); instrumentation pushes it
# past that anchor. test_Gas_recordUsageStaysAtItsAnchor (UsageCounterTest) checks
# recordClauseUsage's raw execution gas stays under its anchor (180,000);
# instrumentation measures ~258,000. test_Gas_settleStreamCommit,
# test_Gas_settleStreamResolution and test_Gas_settleStreamWord (the batch
# verifier's operation-stream anchors: 12,000, 6,000 and 2,000) measure 14,624,
# 7,661 and 3,717 under instrumentation. All five measure gas COST, not
# correctness — the code paths they exercise are otherwise fully covered by the
# surrounding test files' non-gas assertions.
exec env FOUNDRY_PROFILE=coverage forge coverage \
  --no-match-test "test_Gas_resolveExecutionMarginal|test_Gas_recordUsageStaysAtItsAnchor|test_Gas_settleStreamCommit|test_Gas_settleStreamResolution|test_Gas_settleStreamWord" "$@"
