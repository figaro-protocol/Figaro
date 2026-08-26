/**
 * @figaro-protocol/sdk/derive — Base-graph projections
 *
 * The two protocol-enforced graphs of docs/PUBLIC_GRAPH_MODEL.md, projected
 * as first-class objects from already-fetched core events. Pure folds — the
 * caller supplies `CoreEvents` (a frontend cache or a node-side fetcher);
 * nothing here does I/O. Both COMPOSE the existing reconstruction path
 * (`reconstruct`/`Topology`) and bonding math (`calculateBonds`/
 * `calculateSettlement`) rather than re-deriving either.
 *
 * - Process graph: who committed to what, under what terms, and whether the
 *   commitment resolved — `reconstruct()`'s topology, carried whole.
 * - Settlement graph: the per-order record of kernel settlement — bonds
 *   locked at commit, payouts at resolve. LINEAR per process (the kernel's
 *   own view: a chain of commits against a monotonic cumulative-value
 *   accumulator); it carries no DAG topology — how orders relate is the
 *   process graph's business, and the two layers stay independent.
 */

import type { Hex, Address, Process, BondBreakdown, SettlementBreakdown } from "../types.js";
import { OrderState } from "../types.js";
import type { CoreEvents } from "../state.js";
import { reconstruct, Topology } from "../state.js";
import { calculateBonds, calculateSettlement } from "../bonds.js";

// ── Process graph ───────────────────────────────────────────────────────────

/** The process graph with its truth boundary named: `reconstruct()`'s
 *  process topology, every node economically backed. */
export interface ProcessGraph {
    boundary: "protocol-enforced";
    processes: Map<Hex, Process>;
}

/**
 * Project the process graph from core events — the existing reconstruction,
 * labeled. The graph object is what the canonical queries fold over.
 */
export function projectProcessGraph(events: CoreEvents): ProcessGraph {
    return { boundary: "protocol-enforced", processes: reconstruct(events) };
}

// ── Settlement graph ────────────────────────────────────────────────────────

/** One order's settlement record: what the kernel locked at commit and what
 *  it pays at resolve. */
export interface SettlementEntry {
    orderHash: Hex;
    buyer: Address;
    seller: Address;
    /** The order's value-added — the net transfer at resolution. */
    payment: bigint;
    /** The accumulator at this link — what the seller's bond scales to. */
    cumulativeValue: bigint;
    /** Bonds locked at commit (2× invariants), via `calculateBonds`. */
    locked: BondBreakdown;
    /** The kernel-determined payouts at resolution, via `calculateSettlement` —
     *  what resolves, derived from the invariants (identical for active and
     *  resolved orders; the observed payouts below are the chain facts). */
    atResolution: SettlementBreakdown;
    state: OrderState;
    /** Observed `OrderResolved` payout; null while the order is active —
     *  absence, never a fabricated expectation. */
    sellerPayout: bigint | null;
    buyerPayout: bigint | null;
    /** Block of the commit. */
    blockNumber: number;
}

/** One process's settlement chain — linear, in accumulator order. */
export interface SettlementChain {
    processId: Hex;
    /** The process's one denomination (`currency` is a signed field of every
     *  commitment; a process is monotoken by kernel construction). */
    currency: Address;
    cumulativeValue: bigint;
    resolved: boolean;
    /** Orders in cumulative-value order — the kernel's own linear chain. */
    orders: SettlementEntry[];
}

/** The settlement graph with its truth boundary named: every bond and payout
 *  on-chain, verified by contract invariants. */
export interface SettlementGraph {
    boundary: "protocol-enforced";
    chains: Map<Hex, SettlementChain>;
}

/**
 * Project the settlement graph from core events: a fold over
 * OrderCommitted/OrderResolved/ProcessResolved through the one
 * reconstruction path (`Topology`), emitting per-order settlement entries
 * grouped into per-process linear chains.
 */
export function projectSettlementGraph(events: CoreEvents): SettlementGraph {
    const topology = new Topology();
    topology.applyEvents(events);

    const chains = new Map<Hex, SettlementChain>();
    for (const process of topology.processes.values()) {
        const orders = [...process.orders.values()]
            .sort((a, b) =>
                a.cumulativeValue === b.cumulativeValue
                    ? a.blockNumber - b.blockNumber
                    : a.cumulativeValue < b.cumulativeValue ? -1 : 1,
            )
            .map((o): SettlementEntry => {
                const locked = calculateBonds(o.cumulativeValue, o.payment);
                return {
                    orderHash: o.orderHash,
                    buyer: o.buyer,
                    seller: o.seller,
                    payment: o.payment,
                    cumulativeValue: o.cumulativeValue,
                    locked,
                    atResolution: calculateSettlement(o.payment, locked.sellerBond, locked.buyerBond),
                    state: o.state,
                    sellerPayout: o.sellerPayout ?? null,
                    buyerPayout: o.buyerPayout ?? null,
                    blockNumber: o.blockNumber,
                };
            });
        chains.set(process.processId, {
            processId: process.processId,
            currency: process.currency,
            cumulativeValue: process.cumulativeValue,
            resolved: process.resolved,
            orders,
        });
    }
    return { boundary: "protocol-enforced", chains };
}
