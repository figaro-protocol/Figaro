#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# --ir-minimum enables the Yul IR pipeline for coverage instrumentation, preventing
# stack-too-deep from the shadow counter variables inserted per source statement.
# FOUNDRY_PROFILE=coverage uses via_ir=true + optimizer=true (see foundry.toml).
#
# GasCeilingTest is excluded: its assertions are calibrated for non-instrumented
# bytecode (>1500 orders in 30M gas). Under coverage instrumentation, per-order gas
# cost rises (~14k → ~25k), so only ~1170 orders fit. The test measures gas capacity,
# not correctness — resolveProcess coverage is fully exercised by other test files.
exec env FOUNDRY_PROFILE=coverage forge coverage --ir-minimum \
  --no-match-test "test_Gas_MaxOrdersResolvableUnder30MGas" "$@"
