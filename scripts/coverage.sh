#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# FOUNDRY_PROFILE=coverage runs the FULL Yul IR pipeline (via_ir=true, optimizer=true,
# yul stack_allocation — see foundry.toml) for coverage instrumentation. The shadow
# counters inserted per source statement push FigaroBatchVerifier._decodePV over the
# stack under --ir-minimum's minimal optimization ("too deep in the stack by 6 slots");
# the full optimizer's stack allocation clears it, so --ir-minimum is NOT passed.
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
exec env FOUNDRY_PROFILE=coverage forge coverage \
  --no-match-test "test_Gas_resolveExecutionMarginal|test_Gas_recordUsageStaysAtItsAnchor" "$@"
