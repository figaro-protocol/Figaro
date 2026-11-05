/**
 * @figaro-protocol/sdk — Chain gas ceilings
 *
 * Chain-aware per-process and per-block ceilings derived from the live
 * block gas limit + empirical per-order gas costs measured by
 * `test/core/kernel/GasCeilingTest.t.sol`.
 *
 * Two ceilings the runtime (and any agent) asks about:
 *
 *   maxOrdersResolvablePerProcess(client)
 *     The cap on orders per process such that `resolveProcess` resolves
 *     atomically under a single block's gas budget. A process grown past
 *     this cap can NEVER resolve — every bond in it is locked forever —
 *     so every client-side commit path must check it (FigaroCore cannot:
 *     the agreements live off-chain). Driven by the chain's actual
 *     `block.gasLimit` rather than a hardcoded literal so the same code
 *     works on Ethereum mainnet (30M), Base, Optimism, Arbitrum, etc.
 *
 *   maxCommitsLandableInOneBlock(client)
 *     The cap on independent `commit()` calls that fit in a single block.
 *     Each commit is its own transaction; used for cart-UX progress
 *     signaling and publish-time landing-rate validation.
 *
 * The pure `...ForGasLimit` forms take a gas limit directly (no chain
 * access — just arithmetic, like the bond calculator); the async forms
 * read the live block gas limit from any viem client (structurally typed).
 *
 * Source of truth for the per-order constants is `test/core/kernel/GasCeilingTest.t.sol`
 * — the empirical measurement. `scripts/lint-chain-gas.sh` asserts the
 * Foundry constants and these TS constants match exactly; either side
 * moves, the other must move too.
 */

import { CORE_ABI } from "./abis.js";

/**
 * Minimal structural client shapes — deliberately NOT viem's `PublicClient`.
 * The SDK and its consumers may resolve different viem installations whose
 * generic types are nominally incompatible; a structural method signature
 * accepts any viem client (and any test stub) regardless of version.
 */
export interface BlockGasReader {
    getBlock(args: { blockTag: "latest" }): Promise<{ gasLimit: bigint }>;
}

export interface ResolveCapReader extends BlockGasReader {
    readContract(args: {
        address: `0x${string}`;
        abi: readonly unknown[];
        functionName: string;
        args?: readonly unknown[];
    }): Promise<unknown>;
}

// ── Empirical per-order constants (mirror test/core/kernel/GasCeilingTest.t.sol) ─

/**
 * Per-order cost of resolving one order during `resolveProcess`, measured on
 * REAL post-Glamsterdam transaction receipts against the deployed `FigaroCore`
 * on live Sepolia (not estimated, not a pre-fork local EVM): resolveProcess
 * over N orders costs `RESOLVE_FIXED_OVERHEAD + RESOLVE_GAS_PER_ORDER·N` at
 * those receipts, read at N=1 and N=2, plus the memory term below. A resolve
 * is its own transaction, so each order's distinct `orderStatus`/balance
 * entries pay COLD access (two ERC-20 transfers + struct keccaks + SSTORE +
 * LOG + the order's calldata). The fork's repricing (EIP-8037 state creation, EIP-7778 refund accounting)
 * is why these sit above any pre-fork local measurement.
 *
 * `sdk/tests/gasCeilings.test.ts` reads this and the Foundry test's
 * `RESOLVE_GAS_PER_ORDER` from their sources and fails when they differ.
 */
const RESOLVE_GAS_PER_ORDER = 30_000n;

/**
 * Per-order cost of one `commit()` call, measured on live post-Glamsterdam
 * Sepolia receipts at a sub-order commit (the per-order marginal — warm
 * process state); the FIRST commit in a process (root) costs more because
 * it creates the cold `ProcessState` (EIP-8037 prices fresh entries steeply).
 * The marginal is used here; the root's one-time premium is amortized away
 * over a multi-order process.
 *
 * `sdk/tests/gasCeilings.test.ts` reads this and the Foundry test's
 * `COMMIT_GAS_PER_ORDER` from their sources and fails when they differ.
 */
const COMMIT_GAS_PER_ORDER = 383_000n;

/**
 * Fixed per-call overhead of `resolveProcess` independent of order count
 * (function dispatch, processId/process-state reads, activeOrderCount check,
 * ProcessResolved emission, tx base). Measured on live post-fork Sepolia
 * receipts as the intercept of the receipt line above.
 */
const RESOLVE_FIXED_OVERHEAD = 73_000n;

/**
 * Memory the resolve expands into, per order: the struct copied from
 * calldata for its hash (9 words), that hash's `abi.encode` buffer (11) and
 * the order-hash buffer (3), none of them reused across the loop. The EVM
 * charges memory as words²/512, so a resolve over N orders carries
 * `(23·N)²/512` above the receipt line, and nothing at the N=1 and N=2 receipts the line was read from. Measured by
 * `test_Gas_resolveAtPublishedCapFitsTransactionCap`.
 *
 * `sdk/tests/gasCeilings.test.ts` reads these and the Foundry test's
 * constants from their sources and fails when they differ.
 */
const RESOLVE_MEMORY_WORDS_PER_ORDER = 23n;
const RESOLVE_MEMORY_QUADRATIC_DIVISOR = 512n;

/**
 * The chain's cap on one transaction's gas: EIP-7825's 2^24, which mainnet
 * enforces on a transaction's whole gas since Fusaka, and which Glamsterdam
 * keeps on its execution gas. `resolveProcess` is one transaction, so no
 * process may need more than this to resolve, whatever the block holds.
 * A chain without the cap passes its own figure.
 *
 * `sdk/tests/gasCeilings.test.ts` reads this and the Foundry test's
 * `TRANSACTION_GAS_CAP` from their sources and fails when they differ.
 */
export const TRANSACTION_GAS_CAP = 16_777_216n;

/**
 * Headroom factor (×100, integer) applied to ceiling computations. 95
 * means "consume at most 95% of the block's gas budget", leaving 5% for
 * block-by-block gas-limit variance, gas-price oscillation, and any
 * opcode pricing creep we haven't yet measured. Conservative on
 * purpose: paying off-by-one is cheap; an unsubmittable transaction is
 * expensive in user trust.
 */
const GAS_HEADROOM_PCT = 95n;

// ── Pure forms (no chain access — just arithmetic) ───────────────────

/** Gas of `resolveProcess` over `n` orders: the receipt line plus its memory. */
function resolveGasForOrders(n: bigint): bigint {
    const words = RESOLVE_MEMORY_WORDS_PER_ORDER * n;
    return RESOLVE_FIXED_OVERHEAD + RESOLVE_GAS_PER_ORDER * n + (words * words) / RESOLVE_MEMORY_QUADRATIC_DIVISOR;
}

/**
 * Largest N such that `resolveProcess` over N orders fits in one
 * transaction: a block with the given gas limit, after safety headroom, and
 * the chain's cap on one transaction, whichever is smaller. Under the
 * default cap that is 546 orders on any block of 18M or more.
 */
export function maxOrdersResolvableForGasLimit(
    gasLimit: bigint,
    transactionGasCap: bigint = TRANSACTION_GAS_CAP,
): number {
    const blockBudget = (gasLimit * GAS_HEADROOM_PCT) / 100n;
    const budget = blockBudget < transactionGasCap ? blockBudget : transactionGasCap;
    if (budget <= RESOLVE_FIXED_OVERHEAD) return 0;
    // The line's bound is an upper bound; the memory term walks it down.
    let n = (budget - RESOLVE_FIXED_OVERHEAD) / RESOLVE_GAS_PER_ORDER;
    while (n > 0n && resolveGasForOrders(n) > budget) n--;
    return Number(n);
}

/**
 * Largest N independent `commit()` calls that fit in a block with the
 * given gas limit, after safety headroom.
 */
export function maxCommitsLandableForGasLimit(gasLimit: bigint): number {
    const budget = (gasLimit * GAS_HEADROOM_PCT) / 100n;
    return Number(budget / COMMIT_GAS_PER_ORDER);
}

// ── Async forms (read the live block gas limit) ──────────────────────

/**
 * Compute the largest N such that `resolveProcess` over N orders fits
 * in the active chain's block gas budget with safety headroom.
 *
 * Async because the block gas limit is a runtime read; pass the call's
 * result around rather than re-deriving on every render. A chain without
 * the transaction cap passes its own figure as `transactionGasCap`.
 */
export async function maxOrdersResolvablePerProcess(
    client: BlockGasReader,
    transactionGasCap: bigint = TRANSACTION_GAS_CAP,
): Promise<number> {
    const block = await client.getBlock({ blockTag: "latest" });
    return maxOrdersResolvableForGasLimit(block.gasLimit, transactionGasCap);
}

/**
 * Compute the largest N independent `commit()` calls that fit in one
 * block at the active chain's gas limit (with safety headroom). One
 * commit = one tx; this is the per-block landing rate, not the
 * per-process cap (which is `maxOrdersResolvablePerProcess`).
 */
export async function maxCommitsLandableInOneBlock(
    client: BlockGasReader,
): Promise<number> {
    const block = await client.getBlock({ blockTag: "latest" });
    return maxCommitsLandableForGasLimit(block.gasLimit);
}

// ── Live-process resolve capacity ────────────────────────────────────

/** A live process's position against the chain's resolve ceiling. */
export interface ProcessResolveCapacity {
    /** Orders currently active in the process (FigaroCore `activeOrderCount`). */
    activeOrderCount: number;
    /** The chain's per-process resolve ceiling right now. */
    cap: number;
    /** Orders that can still commit before the process becomes unresolvable. */
    remaining: number;
}

/**
 * Read a live process's `activeOrderCount` and the active chain's resolve
 * ceiling in one call. The structural client shape (rather than a full
 * PublicClient) keeps this testable with a stub. A chain without the
 * transaction cap passes its own figure as `transactionGasCap`.
 */
export async function readProcessResolveCapacity(
    client: ResolveCapReader,
    core: `0x${string}`,
    processId: `0x${string}`,
    transactionGasCap: bigint = TRANSACTION_GAS_CAP,
): Promise<ProcessResolveCapacity> {
    const [state, block] = await Promise.all([
        client.readContract({
            address: core,
            abi: CORE_ABI,
            functionName: "processes",
            args: [processId],
        }) as Promise<readonly [`0x${string}`, `0x${string}`, bigint, bigint]>,
        client.getBlock({ blockTag: "latest" }),
    ]);
    const activeOrderCount = Number(state[3]);
    const cap = maxOrdersResolvableForGasLimit(block.gasLimit, transactionGasCap);
    return {
        activeOrderCount,
        cap,
        remaining: Math.max(0, cap - activeOrderCount),
    };
}

/**
 * Refuse a sub-order commit that would push a live process past the
 * chain's resolve ceiling — past it, `resolveProcess` can no longer fit
 * in one block and every bond in the process is locked forever. The
 * FigaroCore cannot enforce this (the ceiling is a block-gas property, and
 * the agreements live off-chain), so every client-side commit path calls this.
 *
 * Root commitments (`processId` = zero) pass trivially — they create a
 * fresh process with one order. Whether the process EXISTS is the
 * FigaroCore's check, not this one's (`UnknownProcess` reverts on-chain).
 *
 * The refusal stands although the constants were measured on one network:
 * a wrong refusal costs the buyer a fresh process, a missing one locks every
 * bond in the process for good, and the message names the ceiling as this
 * SDK's estimate. A chain whose cap differs passes its own figure as
 * `transactionGasCap`; a chain whose per-order costs differ re-measures the
 * constants above, never drops the check.
 */
export async function assertOrderFitsResolveCap(
    client: ResolveCapReader,
    core: `0x${string}`,
    processId: `0x${string}`,
    transactionGasCap: bigint = TRANSACTION_GAS_CAP,
): Promise<void> {
    if (/^0x0+$/.test(processId)) return;
    const { activeOrderCount, cap } = await readProcessResolveCapacity(client, core, processId, transactionGasCap);
    if (activeOrderCount + 1 > cap) {
        throw new Error(
            `Process has ${activeOrderCount} active orders; ${cap} is the most the SDK plans to fit ` +
                `in one atomic resolveProcess on this chain (the SDK's own estimate from the block's ` +
                `gas limit, not a limit the chain enforces). Committing another order risks making ` +
                `the process permanently unresolvable — open a new process instead.`,
        );
    }
}
