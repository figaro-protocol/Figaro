import { describe, it, expect } from "vitest";
import { reconstruct, Topology } from "../src/state.js";
import type { CoreEvents } from "../src/state.js";
import { OrderState } from "../src/types.js";
import type {
    Hex,
    Address,
    OrderCommittedEvent,
    OrderResolvedEvent,
    ProcessResolvedEvent,
} from "../src/types.js";

const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const TOKEN = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const PID = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const OHASH = "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;
const OHASH2 = "0x0000000000000000000000000000000000000000000000000000000000000003" as Hex;

function mkEvents(overrides: Partial<CoreEvents> = {}): CoreEvents {
    return {
        orderCommitted: [],
        orderResolved: [],
        processResolved: [],
        ...overrides,
    };
}

function mkCommit(hash: Hex, processId: Hex, blockNumber: number): OrderCommittedEvent {
    return {
        orderHash: hash,
        processId,
        buyer: BUYER,
        seller: SELLER,
        currency: TOKEN,
        payment: 100n,
        cumulativeValue: 100n,
        agreementHash: "0x" as Hex,
        salt: 1n,
        deadline: 999999999n,
        blockNumber,
    };
}

describe("reconstruct", () => {
    it("returns empty map for no events", () => {
        const result = reconstruct(mkEvents());
        expect(result.size).toBe(0);
    });

    it("builds a process from a single commit", () => {
        const events = mkEvents({
            orderCommitted: [mkCommit(OHASH, PID, 1)],
        });
        const processes = reconstruct(events);
        expect(processes.size).toBe(1);
        const proc = processes.get(PID)!;
        expect(proc.orders.size).toBe(1);
        expect(proc.orders.get(OHASH)!.state).toBe(OrderState.Active);
    });

    it("applies resolution to orders", () => {
        const events = mkEvents({
            orderCommitted: [mkCommit(OHASH, PID, 1)],
            processResolved: [
                { processId: PID, buyer: BUYER, orderCount: 1n, blockNumber: 2 } as ProcessResolvedEvent,
            ],
            orderResolved: [
                {
                    orderHash: OHASH,
                    processId: PID,
                    sellerPayout: 300n,
                    buyerPayout: 100n,
                    blockNumber: 2,
                } as OrderResolvedEvent,
            ],
        });
        const processes = reconstruct(events);
        const order = processes.get(PID)!.orders.get(OHASH)!;
        expect(order.state).toBe(OrderState.Resolved);
        expect(order.sellerPayout).toBe(300n);
        expect(order.buyerPayout).toBe(100n);
    });
});

describe("Topology", () => {
    it("incrementally applies events", () => {
        const topology = new Topology();

        // First batch: commit
        topology.applyEvents(mkEvents({
            orderCommitted: [mkCommit(OHASH, PID, 1)],
        }));
        expect(topology.getProcess(PID)).toBeDefined();
        expect(topology.getOrder(OHASH)?.state).toBe(OrderState.Active);

        // Second batch: another order in same process
        topology.applyEvents(mkEvents({
            orderCommitted: [mkCommit(OHASH2, PID, 2)],
        }));
        expect(topology.getProcess(PID)!.orders.size).toBe(2);
    });

    it("getActiveProcesses returns only unresolved", () => {
        const topology = new Topology();
        topology.applyEvents(mkEvents({
            orderCommitted: [mkCommit(OHASH, PID, 1)],
        }));
        expect(topology.getActiveProcesses().length).toBe(1);

        topology.applyEvents(mkEvents({
            processResolved: [
                { processId: PID, buyer: BUYER, orderCount: 1n, blockNumber: 2 } as ProcessResolvedEvent,
            ],
            orderResolved: [
                { orderHash: OHASH, processId: PID, sellerPayout: 300n, buyerPayout: 100n, blockNumber: 2 } as OrderResolvedEvent,
            ],
        }));
        expect(topology.getActiveProcesses().length).toBe(0);
    });

    it("getProcessesByBuyer filters correctly", () => {
        const otherBuyer = "0xdddddddddddddddddddddddddddddddddddddd" as Address;
        const topology = new Topology();
        topology.applyEvents(mkEvents({
            orderCommitted: [
                mkCommit(OHASH, PID, 1),
                {
                    ...mkCommit(OHASH2, "0x0000000000000000000000000000000000000000000000000000000000000099" as Hex, 2),
                    buyer: otherBuyer,
                },
            ],
        }));
        expect(topology.getProcessesByBuyer(BUYER).length).toBe(1);
        expect(topology.getProcessesByBuyer(otherBuyer).length).toBe(1);
    });

    it("getOrdersBySeller filters correctly", () => {
        const topology = new Topology();
        topology.applyEvents(mkEvents({
            orderCommitted: [mkCommit(OHASH, PID, 1)],
        }));
        expect(topology.getOrdersBySeller(SELLER).length).toBe(1);
        expect(topology.getOrdersBySeller(BUYER).length).toBe(0);
    });

    it("buildAgentContext returns structured data", () => {
        const topology = new Topology();
        topology.applyEvents(mkEvents({
            orderCommitted: [mkCommit(OHASH, PID, 1)],
        }));
        const ctx = topology.buildAgentContext(PID);
        expect(ctx).not.toBeNull();
        expect(ctx!.processId).toBe(PID);
        expect(ctx!.orders).toHaveLength(1);
        expect(ctx!.orders[0].orderHash).toBe(OHASH);
    });

    it("buildAgentContext returns null for unknown process", () => {
        const topology = new Topology();
        const ctx = topology.buildAgentContext(PID);
        expect(ctx).toBeNull();
    });
});
