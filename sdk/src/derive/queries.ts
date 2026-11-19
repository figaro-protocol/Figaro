/**
 * @figaro-protocol/sdk/derive — Canonical graph queries
 *
 * The graphs are the first-class objects; these are thin folds over them —
 * the explorer's canonical questions, answerable by anyone from public
 * events. Pure, no I/O.
 *
 * - Market-shape: per-assembly aggregates over the process graph. Assembly
 *   attribution is CALLER-SUPPLIED (a provenance-overlay decode, or the
 *   structural assembly fingerprint the withdraw gate uses) — the query never
 *   guesses, and an unattributed process is counted as such, never binned
 *   under a fabricated key. Chain shapes come from caller-supplied parent
 *   edges (each agreement's `follows`) via `depthsOverParents`; without them
 *   FigaroCore's own linear view stands. A process holding an order whose
 *   edges the caller does not know takes no shape and is counted as such.
 * - Process edges: a process linked to a registered process design takes
 *   the design's edges, the design's positions matched to its commits by
 *   position (`processEdges`); every other process keeps the linear view.
 *   A reader outside the trade holds no agreement body, so these are the
 *   edges it can read, and they are the design, never what was signed.
 * - Wallet-record: one wallet's public trading history — the processes it
 *   resolves as root buyer and the orders it holds either side of.
 *
 * Trade-story is deliberately NOT here: process-record narration is the audit
 * view's job on-site, and node-side it is `reconstruct()` + overlays
 * composed — no third rendering of the same walk.
 */

import type { Hex, Address, Process, Order } from "../types.js";
import { OrderState } from "../types.js";
import { depthsOverParents } from "../topology.js";
import type { PlannedProcessOrder } from "../reconstructOrders.js";
import { commitOrder, type ProcessGraph } from "./graphs.js";

// ── Market-shape ────────────────────────────────────────────────────────────

/** A distinct chain shape and how many processes take it. Depth/width are
 *  computed over caller-supplied parent edges, 0-rooted (a root order is
 *  depth 0 — the shipped UI convention); FigaroCore's own view (no parent
 *  edges supplied) is linear: depth == orderCount - 1, maxWidth == 1. */
export interface ChainShape {
    orderCount: number;
    depth: number;
    maxWidth: number;
    processCount: number;
}

/** Committed and resolved value totals in one denomination. Volumes are kept
 *  PER TOKEN — amounts in different denominations never sum. */
export interface DenominationVolume {
    committed: bigint;
    settled: bigint;
}

/** One assembly's market aggregates. */
export interface MarketShapeGroup {
    /** The caller's attribution key (e.g. a registered processDesignHash). */
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
    /** Processes that take no shape: parent edges were supplied, and at least
     *  one of the process's orders has edges the caller does not know (its
     *  agreement absent or unread, or carrying no topology leaf). */
    unshapedProcessCount: number;
}

/** The market-shape answer. Protocol-derived: the underlying events are
 *  protocol-enforced, but the per-assembly grouping rides provenance links
 *  whose semantic meaning is declared, not checked by FigaroCore. */
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
    followsOf: (orderHash: Hex) => readonly Hex[] | undefined,
): { orderCount: number; depth: number; maxWidth: number } | undefined {
    const ids = orders.map((o) => o.orderHash);
    const parents = new Map<string, string[]>();
    for (const id of ids) {
        const follows = followsOf(id);
        // Unknown edges are not "no edges": the process has no known shape.
        if (follows === undefined) return undefined;
        parents.set(id, [...follows]);
    }
    const depths = depthsOverParents(ids, (id) => parents.get(id) ?? []);
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
 * @param followsOf  caller-supplied parent edges from each
 *                         agreement's `follows`, `undefined` for an order whose
 *                         edges the caller does not know (its process then
 *                         takes no shape); omitted = FigaroCore's linear view
 */
export function marketShape(
    graph: ProcessGraph,
    assemblyKeyOf: (processId: Hex) => string | undefined,
    followsOf?: (orderHash: Hex) => readonly Hex[] | undefined,
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
                unshapedProcessCount: 0,
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
        const token = process.token.toLowerCase();
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

        const shape = followsOf
            ? chainShapeOf(orders, followsOf)
            : {
                orderCount: orders.length,
                depth: Math.max(0, orders.length - 1),
                maxWidth: orders.length > 0 ? 1 : 0,
            };
        if (shape === undefined) {
            group.unshapedProcessCount += 1;
            continue;
        }
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

// ── Process edges: the design, or FigaroCore's linear view ──────────────────

/** One position of a registered process design, as `planProcessOrders` gives it:
 *  its entry's label and the labels of the entries it follows. */
export type DesignPosition = Pick<PlannedProcessOrder, "nodeId" | "parentLocalIds">;

/** The registered process design a process is linked to, and its positions in
 *  commit order (`planProcessOrders(hydrated)`). */
export interface DesignLink {
    processDesignHash: Hex;
    planned: readonly DesignPosition[];
}

/**
 * A process's edges and where they come from. `"design"`: the registered
 * process design's edges, matched to the process's commits by position, which is
 * the design the process was linked to and never what the parties signed (the
 * signed edges are each agreement's topology leaf, which no event carries).
 * `"linear"`: FigaroCore's own view, each order following the one committed
 * before it. Protocol-derived: the commits are protocol-enforced, the link is
 * a provenance attestation or a counted use, and the edges are the design's.
 */
export interface ProcessEdges {
    boundary: "protocol-derived";
    source: "design" | "linear";
    /** The registered process design the edges were read from; null for the linear view. */
    processDesignHash: Hex | null;
    /** The process's order hashes in commit order. */
    orders: readonly Hex[];
    /** Order hash → the order hashes it follows (`[]` on the root). */
    follows: ReadonlyMap<Hex, readonly Hex[]>;
}

/**
 * The design's edges over a process's commits, or undefined when the commits
 * do not fit the design. The commit at position `i` instantiates the design's
 * position `i`: the process design → orders walk commits the positions in this
 * order (`reconstructOrdersFromProcessDesign`). An open process matches the
 * design's first positions; a process with more commits than the design has
 * positions, or whose first position follows another, does not fit.
 */
function designedFollows(orders: readonly Order[], planned: readonly DesignPosition[]): Map<Hex, Hex[]> | undefined {
    if (orders.length === 0 || orders.length > planned.length) return undefined;
    if (planned[0].parentLocalIds.length > 0) return undefined;
    const positionOf = new Map(planned.map((p, i) => [p.nodeId, i]));
    const follows = new Map<Hex, Hex[]>();
    for (let i = 0; i < orders.length; i++) {
        const parents: Hex[] = [];
        for (const id of planned[i].parentLocalIds) {
            const at = positionOf.get(id);
            if (at === undefined || at >= i) return undefined;
            parents.push(orders[at].orderHash);
        }
        follows.set(orders[i].orderHash, parents);
    }
    return follows;
}

/**
 * Every process's edges: the design's for a process `designOf` links to a
 * registered process design whose positions fit its commits, FigaroCore's linear
 * view for every other. `designOf` is the caller's link (the buyer's
 * provenance attestation, or a `UsageRecorded` of the process design naming the
 * process), with the process design's positions in commit order.
 */
export function processEdges(
    graph: ProcessGraph,
    designOf: (processId: Hex) => DesignLink | undefined,
): Map<Hex, ProcessEdges> {
    const out = new Map<Hex, ProcessEdges>();
    for (const process of graph.processes.values()) {
        const orders = commitOrder(process);
        const hashes = orders.map((o) => o.orderHash);
        const link = designOf(process.processId);
        const designed = link ? designedFollows(orders, link.planned) : undefined;
        out.set(process.processId, designed && link
            ? { boundary: "protocol-derived", source: "design", processDesignHash: link.processDesignHash, orders: hashes, follows: designed }
            : {
                boundary: "protocol-derived",
                source: "linear",
                processDesignHash: null,
                orders: hashes,
                follows: new Map(hashes.map((h, i) => [h, i === 0 ? [] : [hashes[i - 1]]])),
            });
    }
    return out;
}

/** The `followsOf` `marketShape` takes, read from `processEdges`. */
export function followsOfEdges(edges: ReadonlyMap<Hex, ProcessEdges>): (orderHash: Hex) => readonly Hex[] | undefined {
    const byOrder = new Map<string, readonly Hex[]>();
    for (const e of edges.values()) for (const [order, follows] of e.follows) byOrder.set(order.toLowerCase(), follows);
    return (orderHash) => byOrder.get(orderHash.toLowerCase());
}

// ── Wallet-record ───────────────────────────────────────────────────────────

/** One wallet's public history, straight off the process graph. Reuses the
 *  graph's own `Process`/`Order` shapes — resolution outcomes ride along. */
export interface WalletRecord {
    boundary: "protocol-enforced";
    wallet: Address;
    /** Processes this wallet resolves (FigaroCore star shape: the one resolver). */
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
