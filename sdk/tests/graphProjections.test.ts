import { describe, it, expect } from "vitest";
import { projectProcessGraph, projectSettlementGraph } from "../src/derive/graphs.js";
import { projectValueFlow } from "../src/derive/composition.js";
import type { VenueEvent, SwapLeg } from "../src/derive/composition.js";
import { marketShape, walletRecord } from "../src/derive/queries.js";
import type { CoreEvents } from "../src/state.js";
import { OrderState } from "../src/types.js";
import type { Hex, Address, OrderCommittedEvent } from "../src/types.js";

const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const SELLER2 = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
const TOKEN = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const TOKEN2 = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
const VENUE = "0xffffffffffffffffffffffffffffffffffffffff" as Address;
const PID = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const PID2 = "0x0000000000000000000000000000000000000000000000000000000000000011" as Hex;
const OHASH = "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;
const OHASH2 = "0x0000000000000000000000000000000000000000000000000000000000000003" as Hex;
const OHASH3 = "0x0000000000000000000000000000000000000000000000000000000000000004" as Hex;

function mkEvents(overrides: Partial<CoreEvents> = {}): CoreEvents {
    return { orderCommitted: [], orderResolved: [], processResolved: [], ...overrides };
}

function mkCommit(overrides: Partial<OrderCommittedEvent> = {}): OrderCommittedEvent {
    return {
        orderHash: OHASH,
        processId: PID,
        buyer: BUYER,
        seller: SELLER,
        currency: TOKEN,
        payment: 100n,
        cumulativeValue: 100n,
        agreementHash: "0x" as Hex,
        salt: 1n,
        deadline: 999999999n,
        blockNumber: 1,
        ...overrides,
    };
}

/** A root order + a sub-order, root process resolved. */
function resolvedChainEvents(): CoreEvents {
    return mkEvents({
        orderCommitted: [
            mkCommit({ blockNumber: 1 }),
            mkCommit({
                orderHash: OHASH2,
                buyer: SELLER,
                seller: SELLER2,
                payment: 150n,
                cumulativeValue: 250n,
                blockNumber: 2,
            }),
        ],
        orderResolved: [
            { orderHash: OHASH, processId: PID, sellerPayout: 300n, buyerPayout: 100n, blockNumber: 5 },
            { orderHash: OHASH2, processId: PID, sellerPayout: 650n, buyerPayout: 150n, blockNumber: 5 },
        ],
        processResolved: [{ processId: PID, buyer: BUYER, orderCount: 2n, blockNumber: 5 }],
    });
}

// ── Base graphs ─────────────────────────────────────────────────────────────

describe("projectProcessGraph", () => {
    it("labels the reconstructed topology protocol-enforced", () => {
        const graph = projectProcessGraph(resolvedChainEvents());
        expect(graph.boundary).toBe("protocol-enforced");
        expect(graph.processes.size).toBe(1);
        expect(graph.processes.get(PID)!.orders.size).toBe(2);
        expect(graph.processes.get(PID)!.resolved).toBe(true);
    });
});

describe("projectSettlementGraph", () => {
    it("folds commits and resolutions into linear per-process chains with 2x bonds", () => {
        const graph = projectSettlementGraph(resolvedChainEvents());
        expect(graph.boundary).toBe("protocol-enforced");
        const chain = graph.chains.get(PID)!;
        expect(chain.currency).toBe(TOKEN);
        expect(chain.resolved).toBe(true);
        // Linear, in accumulator order — the kernel's own chain.
        expect(chain.orders.map((o) => o.cumulativeValue)).toEqual([100n, 250n]);

        const [root, sub] = chain.orders;
        expect(root.locked).toEqual({ sellerBond: 200n, buyerBond: 200n, totalLocked: 400n });
        expect(sub.locked).toEqual({ sellerBond: 500n, buyerBond: 300n, totalLocked: 800n });
        // Kernel-determined payouts agree with the observed events.
        expect(root.atResolution.sellerPayout).toBe(300n);
        expect(root.atResolution.buyerPayout).toBe(100n);
        expect(root.sellerPayout).toBe(300n);
        expect(sub.sellerPayout).toBe(650n);
        expect(root.state).toBe(OrderState.Resolved);
    });

    it("an active order carries null observed payouts — absence, not expectation", () => {
        const graph = projectSettlementGraph(mkEvents({ orderCommitted: [mkCommit()] }));
        const [entry] = graph.chains.get(PID)!.orders;
        expect(entry.state).toBe(OrderState.Active);
        expect(entry.sellerPayout).toBeNull();
        expect(entry.buyerPayout).toBeNull();
        // The invariant-derived settlement is still stated.
        expect(entry.atResolution.netTransfer).toBe(100n);
    });
});

// ── Value flow (composition) ────────────────────────────────────────────────

describe("projectValueFlow", () => {
    it("builds token nodes from settled denominations and edges from caller-supplied venue logs", () => {
        const settlement = projectSettlementGraph(
            mkEvents({
                orderCommitted: [
                    mkCommit(),
                    mkCommit({ orderHash: OHASH2, processId: PID2, currency: TOKEN2, payment: 40n, cumulativeValue: 40n }),
                ],
                orderResolved: [
                    { orderHash: OHASH, processId: PID, sellerPayout: 300n, buyerPayout: 100n, blockNumber: 5 },
                ],
                processResolved: [{ processId: PID, buyer: BUYER, orderCount: 1n, blockNumber: 5 }],
            }),
        );
        const swaps: VenueEvent<SwapLeg>[] = [
            {
                venue: VENUE,
                blockNumber: 3,
                transactionHash: null,
                payload: { tokenIn: TOKEN2, tokenOut: TOKEN, amountIn: 10n, amountOut: 9n },
            },
            {
                venue: VENUE,
                blockNumber: 4,
                transactionHash: null,
                payload: { tokenIn: TOKEN2, tokenOut: TOKEN, amountIn: 5n, amountOut: 4n },
            },
        ];

        const graph = projectValueFlow(settlement, swaps, [TOKEN2]);
        expect(graph.boundary).toBe("composition-derived");

        const nodeA = graph.nodes.find((n) => n.token === TOKEN)!;
        expect(nodeA.settledVolume).toBe(100n);
        expect(nodeA.settledOrderCount).toBe(1);
        expect(nodeA.processCount).toBe(1);
        expect(nodeA.pinned).toBe(false);

        const nodeB = graph.nodes.find((n) => n.token === TOKEN2)!;
        expect(nodeB.settledVolume).toBe(0n); // committed, not settled
        expect(nodeB.pinned).toBe(true);

        // One protocol-enforced settlement edge (only the settled denomination)...
        const settlementEdges = graph.edges.filter((e) => e.basis === "protocol-enforced");
        expect(settlementEdges).toEqual([
            { basis: "protocol-enforced", token: TOKEN, settledOrderCount: 1, settledVolume: 100n },
        ]);
        // ...and the venue legs aggregated per (venue, tokenIn, tokenOut).
        const venueEdges = graph.edges.filter((e) => e.basis === "composition-derived");
        expect(venueEdges).toEqual([
            {
                basis: "composition-derived",
                venue: VENUE,
                tokenIn: TOKEN2,
                tokenOut: TOKEN,
                legCount: 2,
                volumeIn: 15n,
                volumeOut: 13n,
            },
        ]);
    });

    it("no venue logs supplied means no venue edges — absence, never a bundled venue", () => {
        const graph = projectValueFlow(projectSettlementGraph(mkEvents()), [], []);
        expect(graph.nodes).toEqual([]);
        expect(graph.edges).toEqual([]);
    });
});

// ── Canonical queries ───────────────────────────────────────────────────────

describe("marketShape", () => {
    const events = mkEvents({
        orderCommitted: [
            mkCommit({ blockNumber: 1 }),
            mkCommit({
                orderHash: OHASH2,
                buyer: SELLER,
                seller: SELLER2,
                payment: 150n,
                cumulativeValue: 250n,
                blockNumber: 2,
            }),
            mkCommit({ orderHash: OHASH3, processId: PID2, payment: 70n, cumulativeValue: 70n, blockNumber: 9 }),
        ],
        orderResolved: [
            { orderHash: OHASH, processId: PID, sellerPayout: 300n, buyerPayout: 100n, blockNumber: 5 },
            { orderHash: OHASH2, processId: PID, sellerPayout: 650n, buyerPayout: 150n, blockNumber: 5 },
        ],
        processResolved: [{ processId: PID, buyer: BUYER, orderCount: 2n, blockNumber: 5 }],
    });

    it("aggregates volume, cadence, pairs, and shapes per caller-attributed assembly", () => {
        const graph = projectProcessGraph(events);
        const shape = marketShape(graph, (pid) => (pid === PID ? "assembly-x" : undefined));

        expect(shape.boundary).toBe("protocol-derived");
        expect(shape.unattributedProcessCount).toBe(1); // PID2 has no attribution
        const group = shape.groups.get("assembly-x")!;
        expect(group.processCount).toBe(1);
        expect(group.orderCount).toBe(2);
        expect(group.distinctPairCount).toBe(2); // buyer→seller, seller→seller2
        expect(group.processCommitBlocks).toEqual([1]);
        const volume = group.volumeByDenomination.get(TOKEN.toLowerCase())!;
        expect(volume.committed).toBe(250n);
        expect(volume.settled).toBe(250n);
        // Kernel view without parent edges: linear.
        expect(group.shapes).toEqual([{ orderCount: 2, depth: 2, maxWidth: 1, processCount: 1 }]);
    });

    it("derives chain shapes from caller-supplied parent edges via topological order", () => {
        // Root + two co-equal children of the root: depth 2, width 2.
        const fanOut = mkEvents({
            orderCommitted: [
                mkCommit({ blockNumber: 1 }),
                mkCommit({ orderHash: OHASH2, seller: SELLER2, payment: 50n, cumulativeValue: 150n, blockNumber: 2 }),
                mkCommit({ orderHash: OHASH3, seller: SELLER2, payment: 25n, cumulativeValue: 175n, blockNumber: 3 }),
            ],
        });
        const parents = new Map<Hex, Hex[]>([
            [OHASH2, [OHASH]],
            [OHASH3, [OHASH]],
        ]);
        const shape = marketShape(
            projectProcessGraph(fanOut),
            () => "assembly-y",
            (orderHash) => parents.get(orderHash) ?? [],
        );
        expect(shape.groups.get("assembly-y")!.shapes).toEqual([
            { orderCount: 3, depth: 2, maxWidth: 2, processCount: 1 },
        ]);
    });
});

describe("walletRecord", () => {
    it("filters the process graph by buyer and seller address", () => {
        const graph = projectProcessGraph(resolvedChainEvents());

        const asRoot = walletRecord(graph, BUYER);
        expect(asRoot.boundary).toBe("protocol-enforced");
        expect(asRoot.processesAsRootBuyer.map((p) => p.processId)).toEqual([PID]);
        expect(asRoot.ordersAsBuyer.map((o) => o.orderHash)).toEqual([OHASH]);
        expect(asRoot.ordersAsSeller).toEqual([]);

        // The mid-chain party is buyer of the sub-order and seller of the root order.
        const mid = walletRecord(graph, SELLER);
        expect(mid.processesAsRootBuyer).toEqual([]);
        expect(mid.ordersAsBuyer.map((o) => o.orderHash)).toEqual([OHASH2]);
        expect(mid.ordersAsSeller.map((o) => o.orderHash)).toEqual([OHASH]);
        expect(mid.ordersAsSeller[0].sellerPayout).toBe(300n);
    });

    it("a wallet with no history resolves to empty arrays — absence, not error", () => {
        const graph = projectProcessGraph(mkEvents());
        const record = walletRecord(graph, VENUE);
        expect(record.processesAsRootBuyer).toEqual([]);
        expect(record.ordersAsBuyer).toEqual([]);
        expect(record.ordersAsSeller).toEqual([]);
    });
});
