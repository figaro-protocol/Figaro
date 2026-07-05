/**
 * @figaro/core — Chain gas ceilings
 *
 * Chain-aware per-process and per-block ceilings derived from the live
 * block gas limit + empirical per-order gas costs measured by
 * `test/GasCeilingTest.t.sol`.
 *
 * Two ceilings the runtime (and any agent) asks about:
 *
 *   maxOrdersResolvablePerProcess(client)
 *     The cap on orders per process such that `resolveProcess` settles
 *     atomically under a single block's gas budget. A process grown past
 *     this cap can NEVER resolve — every bond in it is locked forever —
 *     so every client-side commit path must check it (the kernel cannot:
 *     the composed agreements live off-chain). Driven by the chain's actual
 *     `block.gasLimit` rather than a hardcoded literal so the same code
 *     works on Ethereum mainnet (30M), Base, Optimism, Arbitrum, etc.
 *
 *   maxCommitsLandableInOneBlock(client)
 *     The cap on independent `commit()` calls that fit in a single block.
 *     Each commit is its own transaction; used for cart-UX progress
 *     signalling and publish-time landing-rate validation.
 *
 * The pure `...ForGasLimit` forms take a gas limit directly (no chain
 * access — just arithmetic, like the bond calculator); the async forms
 * read the live block gas limit from any viem client (structurally typed).
 *
 * Source of truth for the per-order constants is `test/GasCeilingTest.t.sol`
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

// ── Pure forms (no chain access — just arithmetic) ───────────────────

/**
 * Largest N such that `resolveProcess` over N orders fits in a block
 * with the given gas limit, after safety headroom.
 */
export function maxOrdersResolvableForGasLimit(gasLimit: bigint): number {
    const budget = (gasLimit * GAS_HEADROOM_PCT) / 100n;
    if (budget <= RESOLVE_FIXED_OVERHEAD) return 0;
    return Number((budget - RESOLVE_FIXED_OVERHEAD) / RESOLVE_GAS_PER_ORDER);
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
 * result around rather than re-deriving on every render.
 */
export async function maxOrdersResolvablePerProcess(
    client: BlockGasReader,
): Promise<number> {
    const block = await client.getBlock({ blockTag: "latest" });
    return maxOrdersResolvableForGasLimit(block.gasLimit);
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
    /** Orders currently active in the process (kernel `activeOrderCount`). */
    activeOrderCount: number;
    /** The chain's per-process resolve ceiling right now. */
    cap: number;
    /** Orders that can still commit before the process becomes unresolvable. */
    remaining: number;
}

/**
 * Read a live process's `activeOrderCount` and the active chain's resolve
 * ceiling in one call. The structural client shape (rather than a full
 * PublicClient) keeps this testable with a stub.
 */
export async function readProcessResolveCapacity(
    client: ResolveCapReader,
    core: `0x${string}`,
    processId: `0x${string}`,
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
    const cap = maxOrdersResolvableForGasLimit(block.gasLimit);
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
 * kernel cannot enforce this (the ceiling is a block-gas property, and
 * the composed agreements live off-chain), so every client-side commit path calls this.
 *
 * Root commitments (`processId` = zero) pass trivially — they create a
 * fresh process with one order. Whether the process EXISTS is the
 * kernel's check, not this one's (`UnknownProcess` reverts on-chain).
 */
export async function assertOrderFitsResolveCap(
    client: ResolveCapReader,
    core: `0x${string}`,
    processId: `0x${string}`,
): Promise<void> {
    if (/^0x0+$/.test(processId)) return;
    const { activeOrderCount, cap } = await readProcessResolveCapacity(client, core, processId);
    if (activeOrderCount + 1 > cap) {
        throw new Error(
            `Process has ${activeOrderCount} active orders; this chain settles at most ${cap} ` +
                `in one atomic resolveProcess. Committing another order would make the process ` +
                `permanently unresolvable — compose a new process instead.`,
        );
    }
}
