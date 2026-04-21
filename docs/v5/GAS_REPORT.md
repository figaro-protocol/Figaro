# Figaro Protocol - Gas Consumption Report

**Date**: February 18, 2026
**Test Suite**: [test/GasResolveProcessV3.t.sol](test/GasResolveProcessV3.t.sol)
**Contract**: [src/FigaroCore.sol](src/FigaroCore.sol)

---

## Executive Summary (V3)

This report focuses on the practical question that matters for deployment:

- What is the maximum number of Active orders that can be atomically resolved all-or-nothing by `resolveProcess()` without exceeding a realistic transaction gas budget?

**Benchmark result (local Foundry run, 30M gas budget):**

- `resolveProcess_gasBudget`: **30,000,000**
- `resolveProcess_maxOrders`: **549**
- `resolveProcess_gasUsed_atMax`: **29,959,588**

This corresponds to roughly **~54.6k gas/order** at the max-success point (budgeted call).

---

## Benchmark Methodology

The benchmark in [test/GasResolveProcessV3.t.sol](test/GasResolveProcessV3.t.sol):

- Builds a linear process up to `MAX_ORDERS_TO_BUILD = 600`.
- Takes a snapshot after each `acceptOffer()`.
- Uses binary search to find the maximum `N` such that a budgeted call succeeds:
  - `address(core).call{gas: GAS_BUDGET}(abi.encodeCall(core.resolveProcess, (processId, ids)))`
- Measures gas at the max-success `N`.

To run:

- `forge test --match-path test/GasResolveProcessV3.t.sol -vvv`

---

## Deployment Parameter: `maxProcessSize`

V3 introduces a constructor-configurable cap on the number of Active orders allowed in a single process:

- `maxProcessSize` is set at deployment time in [src/FigaroCore.sol](src/FigaroCore.sol).
- The default is **500** when the constructor argument is `0`.
- The cap is enforced at `acceptOffer()` time (so Pending proposals can exist, but the Active set is bounded).

**Important:** the benchmark deploys `FigaroCore` with a higher `maxProcessSize` (currently `2000`) to ensure the measurement is gas-bounded rather than capped by the default 500.

---

## Notes / Limitations

- Gas results vary by compiler settings, EVM version, and the exact calldata shape. Treat the number above as a reproducible engineering datapoint, not a universal constant.
- The previous v2.x ("v2.3") comparison referenced in this file is not currently reproducible from this repository state because the referenced v2.3 contract/tests are not present.
