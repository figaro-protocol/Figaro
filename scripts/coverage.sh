#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# --ir-minimum enables the Yul IR pipeline for coverage instrumentation, preventing
# stack-too-deep from the shadow counter variables inserted per source statement.
# FOUNDRY_PROFILE=coverage uses via_ir=true + optimizer=true (see foundry.toml).
#
# Two gas-anchor tests are excluded: their assertions are calibrated for
# non-instrumented bytecode, and coverage's shadow counters raise per-call gas.
# test_Gas_resolveExecutionMarginal (GasCeilingTest) checks the warm resolve-loop
# marginal stays below RESOLVE_GAS_PER_ORDER (23,000); instrumentation pushes it
# past that anchor. test_Gas_recordUsageStaysAtItsAnchor (UsageCounterTest) checks
# recordClauseUsage's raw execution gas stays under its anchor (180,000);
# instrumentation measures ~258,000. Both measure gas COST, not correctness — the
# code paths they exercise are otherwise fully covered by the surrounding test
# files' non-gas assertions.
exec env FOUNDRY_PROFILE=coverage forge coverage --ir-minimum \
  --no-match-test "test_Gas_resolveExecutionMarginal|test_Gas_recordUsageStaysAtItsAnchor" "$@"
