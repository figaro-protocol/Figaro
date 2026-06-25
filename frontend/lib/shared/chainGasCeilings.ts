/**
 * chainGasCeilings.ts — chain-aware per-process and per-block ceilings
 * derived from the live block gas limit + empirical per-order gas costs
 * measured by `test/GasCeilingTest.t.sol`.
 *
 * Two ceilings the rest of the runtime asks about:
 *
 *   maxOrdersResolvablePerProcess(client)
 *     The cap on orders per process such that `resolveProcess` settles
 *     atomically under a single block's gas budget. Per-order gas is
 *     `RESOLVE_GAS_PER_ORDER`; fixed overhead is `RESOLVE_FIXED_OVERHEAD`;
 *     a safety headroom factor leaves slack for opcode-pricing creep,
 *     block-by-block gas-limit variance, and node-validation overhead.
 *     Driven by the chain's actual `block.gasLimit` rather than a
 *     hardcoded literal so the same code works on Ethereum mainnet (30M),
 *     Base (varies), Optimism (varies), Arbitrum (very high), etc.
 *
 *   maxCommitsLandableInOneBlock(client)
 *     The cap on independent `commit()` calls that fit in a single block.
 *     Each commit is its own transaction; per-call gas is
 *     `COMMIT_GAS_PER_ORDER`. Used for cart-UX progress signalling
 *     ("publishing your N commitments takes ~M blocks") and for
 *     publish-time validation that an assembly's per-block landing rate
 *     is realistic.
 *
 * Source of truth for the per-order constants is `test/GasCeilingTest.t.sol`
 * — the empirical measurement. `scripts/lint-chain-gas.sh` asserts the
 * Foundry constants and these TS constants match exactly; either side
 * moves, the other must move too (model: `scripts/lint-token-ops.sh`
 * and `scripts/lint-clause-counts.sh`).
 *
 * Pairs with the P0 multi-tx checkout backlog item — single-tx checkout
 * doesn't scale, so the runtime needs a way to ask "how many orders
 * can land per block" and "how many resolve atomically" without
 * baking a literal that pretends every chain has a 30M block.
 */

import type { PublicClient } from "viem";

// ── Empirical per-order constants (mirror test/GasCeilingTest.t.sol) ─

/**
 * Per-order cost of settling one order during `resolveProcess`, measured on
 * REAL Anvil transaction receipts (not estimated): resolveProcess over N orders
 * costs `38,000 + 23,000·N` gas. A resolve is its own transaction, so each
 * order's distinct `orderStatus`/balance slots pay COLD access — the all-in
 * per-order is ~23,000 (two ERC-20 transfers + struct keccaks + SSTORE + LOG +
 * the order's calldata). Receipt points: N=2→83,949, N=10→267,772, N=15→382,930
 * (marginal flat at ~22,997). Measured 2026-06-25 against `FigaroCore` on Anvil.
 *
 * Linted against the matching `RESOLVE_GAS_PER_ORDER` constant in
 * the Foundry test; either side moves, the other must move too.
 */
const RESOLVE_GAS_PER_ORDER = 23_000n;

/**
 * Per-order cost of one `commit()` call, measured on Anvil receipts: a sub-order
 * commit is ~144k (the per-order marginal — warm process state); the FIRST
 * commit in a process (root) is ~235k because it creates the cold `ProcessState`.
 * 144k is the marginal used here; the root's one-time +~91k is amortized away
 * over a multi-order process.
 *
 * Linted against the matching `COMMIT_GAS_PER_ORDER` constant in the
 * Foundry test.
 */
const COMMIT_GAS_PER_ORDER = 144_000n;

/**
 * Fixed per-call overhead of `resolveProcess` independent of order count
 * (function dispatch, processId/process-state reads, activeOrderCount check,
 * ProcessResolved emission, tx base). Measured on Anvil receipts as ~38,000
 * (the intercept of `38,000 + 23,000·N`).
 */
const RESOLVE_FIXED_OVERHEAD = 38_000n;

/**
 * Headroom factor (×100, integer) applied to ceiling computations. 95
 * means "consume at most 95% of the block's gas budget", leaving 5% for
 * block-by-block gas-limit variance, gas-price oscillation, and any
 * opcode pricing creep we haven't yet measured. Conservative on
 * purpose: paying off-by-one is cheap; an unsubmittable transaction is
 * expensive in user trust.
 */
const GAS_HEADROOM_PCT = 95n;

// ── Public API ────────────────────────────────────────────────────────

/**
 * Compute the largest N such that `resolveProcess` over N orders fits
 * in the active chain's block gas budget with safety headroom.
 *
 * Async because the block gas limit is a runtime read; pass the call's
 * result around rather than re-deriving on every render.
 */
export async function maxOrdersResolvablePerProcess(
    client: PublicClient,
): Promise<number> {
    const block = await client.getBlock({ blockTag: "latest" });
    const budget = (block.gasLimit * GAS_HEADROOM_PCT) / 100n;
    if (budget <= RESOLVE_FIXED_OVERHEAD) return 0;
    const orderBudget = budget - RESOLVE_FIXED_OVERHEAD;
    const n = orderBudget / RESOLVE_GAS_PER_ORDER;
    return Number(n);
}

/**
 * Compute the largest N independent `commit()` calls that fit in one
 * block at the active chain's gas limit (with safety headroom). One
 * commit = one tx; this is the per-block landing rate, not the
 * per-process cap (which is `maxOrdersResolvablePerProcess`).
 */
export async function maxCommitsLandableInOneBlock(
    client: PublicClient,
): Promise<number> {
    const block = await client.getBlock({ blockTag: "latest" });
    const budget = (block.gasLimit * GAS_HEADROOM_PCT) / 100n;
    const n = budget / COMMIT_GAS_PER_ORDER;
    return Number(n);
}
