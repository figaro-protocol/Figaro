/**
 * @figaro-protocol/sdk/derive — Canonical graph queries
 *
 * The graphs are the first-class objects; these are thin folds over them —
 * the explorer's canonical questions, answerable by anyone from public
 * events. Pure, no I/O.
 *
 * - Market-shape: per-assembly aggregates over the process graph. Assembly
 *   attribution is CALLER-SUPPLIED (a provenance-overlay decode, or the
 *   structural template fingerprint the withdraw gate uses) — the query never
 *   guesses, and an unattributed process is counted as such, never binned
 *   under a fabricated key. Chain shapes come from caller-supplied parent
 *   edges (decoded topology sections) via `depthsOverParents`; without them
 *   the kernel's own linear view stands.
 * - Wallet-record: one wallet's public trading history — the processes it
 *   resolves as root buyer and the orders it holds either side of.
 *
 * Deal-story is deliberately NOT here: process-record narration is the audit
 * view's job on-site, and node-side it is `reconstruct()` + overlays
 * composed — no third rendering of the same walk.
 */

import type { Hex, Address, Process, Order } from "../types.js";
import { OrderState } from "../types.js";
import { depthsOverParents } from "../topology.js";
import type { ProcessGraph } from "./graphs.js";

// ── Market-shape ────────────────────────────────────────────────────────────

/** A distinct chain shape and how many processes take it. Depth/width are
 *  computed over caller-supplied parent edges, 0-rooted (a root order is
 *  depth 0 — the shipped UI convention); the kernel's own view (no parent
 *  edges supplied) is linear: depth == orderCount - 1, maxWidth == 1. */
export interface ChainShape {
    orderCount: number;
    depth: number;
    maxWidth: number;
    processCount: number;
}

/** Committed and settled value totals in one denomination. Volumes are kept
 *  PER TOKEN — amounts in different denominations never sum. */
export interface DenominationVolume {
    committed: bigint;
    settled: bigint;
}

/** One assembly's market aggregates. */
export interface MarketShapeGroup {
    /** The caller's attribution key (e.g. a registered compositionHash). */
    key: string;
    processCount: number;
    orderCount: number;
    /** Distinct buyer→seller pairs across the group's orders. */
    distinctPairCount: number;
    /** Per-denomination value totals (map key: lowercased token address). */
    volumeByDenomination: Map<string, DenominationVolume>;
    /** Each process's first commit block, ascending — the cadence series
     *  (spacing in chain time; block numbers, never wall clocks). */
    processCommitBlocks: number[];
    /** Distinct chain shapes with per-shape process counts. */
    shapes: ChainShape[];
}

/** The market-shape answer. Protocol-derived: the underlying events are
 *  protocol-enforced, but the per-assembly grouping rides provenance links
 *  whose semantic meaning is declared, not kernel-checked. */
export interface MarketShape {
    boundary: "protocol-derived";
    groups: Map<string, MarketShapeGroup>;
    /** Processes the caller's attribution could not key — absence, surfaced. */
    unattributedProcessCount: number;
}

/** Depth and width of one process's chain over in-set parent edges —
 *  0-rooted via `depthsOverParents`. */
function chainShapeOf(
    orders: readonly Order[],
    parentOrderHashesOf: (orderHash: Hex) => readonly Hex[],
): { orderCount: number; depth: number; maxWidth: number } {
    const ids = orders.map((o) => o.orderHash);
    const depths = depthsOverParents(ids, (id) => [...parentOrderHashesOf(id as Hex)]);
    let depth = 0;
    const widthAt = new Map<number, number>();
    for (const d of depths.values()) {
        depth = Math.max(depth, d);
        widthAt.set(d, (widthAt.get(d) ?? 0) + 1);
    }
    const maxWidth = [...widthAt.values()].reduce((max, w) => Math.max(max, w), 0);
    return { orderCount: orders.length, depth, maxWidth };
}

/**
 * Per-assembly market aggregates over the process graph.
 *
 * @param graph            the projected process graph
 * @param assemblyKeyOf    caller-supplied attribution: processId → assembly
 *                         key, `undefined` when the process is unattributed
 * @param parentOrderHashesOf  caller-supplied parent edges from decoded
 *                         topology sections; omitted = the kernel's linear view
 */
export function marketShape(
    graph: ProcessGraph,
    assemblyKeyOf: (processId: Hex) => string | undefined,
    parentOrderHashesOf?: (orderHash: Hex) => readonly Hex[],
): MarketShape {
    const groups = new Map<string, MarketShapeGroup>();
    // Per-group working state kept off the public shape.
    const pairsOf = new Map<string, Set<string>>();
    const shapesOf = new Map<string, Map<string, ChainShape>>();
    let unattributedProcessCount = 0;

    for (const process of graph.processes.values()) {
        const key = assemblyKeyOf(process.processId);
        if (key === undefined) {
            unattributedProcessCount += 1;
            continue;
        }
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                processCount: 0,
                orderCount: 0,
                distinctPairCount: 0,
                volumeByDenomination: new Map(),
                processCommitBlocks: [],
                shapes: [],
            };
            groups.set(key, group);
            pairsOf.set(key, new Set());
            shapesOf.set(key, new Map());
        }

        const orders = [...process.orders.values()];
        group.processCount += 1;
        group.orderCount += orders.length;
        group.processCommitBlocks.push(
            orders.reduce((min, o) => Math.min(min, o.blockNumber), Number.POSITIVE_INFINITY),
        );

        const pairs = pairsOf.get(key)!;
        const token = process.currency.toLowerCase();
        let volume = group.volumeByDenomination.get(token);
        if (!volume) {
            volume = { committed: 0n, settled: 0n };
            group.volumeByDenomination.set(token, volume);
        }
        for (const order of orders) {
            pairs.add(`${order.buyer.toLowerCase()}→${order.seller.toLowerCase()}`);
            volume.committed += order.payment;
            if (order.state === OrderState.Resolved) volume.settled += order.payment;
        }

        const shape = parentOrderHashesOf
            ? chainShapeOf(orders, parentOrderHashesOf)
            : {
                orderCount: orders.length,
                depth: Math.max(0, orders.length - 1),
                maxWidth: orders.length > 0 ? 1 : 0,
            };
        const shapeKey = `${shape.orderCount}|${shape.depth}|${shape.maxWidth}`;
        const shapes = shapesOf.get(key)!;
        const existing = shapes.get(shapeKey);
        if (existing) existing.processCount += 1;
        else shapes.set(shapeKey, { ...shape, processCount: 1 });
    }

    for (const group of groups.values()) {
        group.distinctPairCount = pairsOf.get(group.key)!.size;
        group.processCommitBlocks.sort((a, b) => a - b);
        group.shapes = [...shapesOf.get(group.key)!.values()];
    }
    return { boundary: "protocol-derived", groups, unattributedProcessCount };
}

// ── Wallet-record ───────────────────────────────────────────────────────────

/** One wallet's public history, straight off the process graph. Reuses the
 *  graph's own `Process`/`Order` shapes — settlement outcomes ride along. */
export interface WalletRecord {
    boundary: "protocol-enforced";
    wallet: Address;
    /** Processes this wallet resolves (kernel star shape: the one resolver). */
    processesAsRootBuyer: Process[];
    /** Orders this wallet is the per-order buyer of (root and sub-orders). */
    ordersAsBuyer: Order[];
    /** Orders this wallet added value on. */
    ordersAsSeller: Order[];
}

/**
 * A wallet's public trading record: the process graph filtered by
 * buyer/seller address. Resolved-empty arrays are the answer for a wallet
 * with no history — absence, never an error.
 */
export function walletRecord(graph: ProcessGraph, wallet: Address): WalletRecord {
    const lc = wallet.toLowerCase();
    const processesAsRootBuyer = graph.topology.getProcessesByBuyer(wallet);
    const ordersAsBuyer: Order[] = [];
    for (const process of graph.processes.values()) {
        for (const order of process.orders.values()) {
            if (order.buyer.toLowerCase() === lc) ordersAsBuyer.push(order);
        }
    }
    const byBlock = (a: { blockNumber: number }, b: { blockNumber: number }) =>
        a.blockNumber - b.blockNumber;
    ordersAsBuyer.sort(byBlock);
    const ordersAsSeller = graph.topology.getOrdersBySeller(wallet).sort(byBlock);
    return { boundary: "protocol-enforced", wallet, processesAsRootBuyer, ordersAsBuyer, ordersAsSeller };
}
