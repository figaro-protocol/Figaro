/**
 * @figaro/sdk — State Reconstructor
 *
 * Builds a typed in-memory process graph from parsed events.
 * Stateless by default — call reconstruct() with events, get state out.
 * For incremental updates, use the ProcessGraph class.
 */

import type {
    Hex,
    Address,
    Order,
    Process,
    OrderState,
    OrderCommittedEvent,
    OrderResolvedEvent,
    ProcessResolvedEvent,
    AgentProcessContext,
    AgentOrderContext,
} from "./types.js";
import { OrderState as OS } from "./types.js";

// ── One-shot reconstruction ─────────────────────────────────────────────────

export interface CoreEvents {
    orderCommitted: OrderCommittedEvent[];
    orderResolved: OrderResolvedEvent[];
    processResolved: ProcessResolvedEvent[];
}

/**
 * Reconstruct the full process graph from parsed events.
 * Returns a Map<processId, Process>.
 */
export function reconstruct(events: CoreEvents): Map<Hex, Process> {
    const graph = new ProcessGraph();
    graph.applyEvents(events);
    return graph.processes;
}

// ── Incremental process graph ───────────────────────────────────────────────

/**
 * Mutable process graph that can be incrementally updated as new events arrive.
 * This is the "shadow state" an agent maintains.
 */
export class ProcessGraph {
    readonly processes = new Map<Hex, Process>();
    private readonly orderIndex = new Map<Hex, Order>();

    /** Apply a batch of events (e.g. from fetchCoreEvents). */
    applyEvents(events: CoreEvents): void {
        // 1. Process commits (sorted by block for deterministic replay)
        const sorted = [...events.orderCommitted].sort((a, b) => a.blockNumber - b.blockNumber);
        for (const e of sorted) {
            this.applyOrderCommitted(e);
        }

        // 2. Apply resolutions
        for (const e of events.orderResolved) {
            this.applyOrderResolved(e);
        }

        for (const e of events.processResolved) {
            this.applyProcessResolved(e);
        }
    }

    /** Get a single process by ID. */
    getProcess(processId: Hex): Process | undefined {
        return this.processes.get(processId);
    }

    /** Get a single order by hash. */
    getOrder(orderHash: Hex): Order | undefined {
        return this.orderIndex.get(orderHash);
    }

    /** All active (unresolved) processes. */
    getActiveProcesses(): Process[] {
        return [...this.processes.values()].filter((p) => !p.resolved);
    }

    /** All processes where the given address is the root buyer. */
    getProcessesByBuyer(buyer: Address): Process[] {
        const lc = buyer.toLowerCase();
        return [...this.processes.values()].filter(
            (p) => p.rootBuyer.toLowerCase() === lc,
        );
    }

    /** All orders where the given address is the seller. */
    getOrdersBySeller(seller: Address): Order[] {
        const lc = seller.toLowerCase();
        return [...this.orderIndex.values()].filter(
            (o) => o.seller.toLowerCase() === lc,
        );
    }

    /**
     * Build a structured context object for an agent.
     * This is the JSON briefing an LLM or specialized agent receives.
     */
    buildAgentContext(processId: Hex): AgentProcessContext | null {
        const process = this.processes.get(processId);
        if (!process) return null;

        const orders: AgentOrderContext[] = [...process.orders.values()].map((o) => ({
            orderHash: o.orderHash,
            buyer: o.buyer,
            seller: o.seller,
            payment: o.payment,
            cumulativeValue: o.cumulativeValue,
            state: o.state === OS.Active ? "Active" : "Resolved",
        }));

        return {
            processId,
            rootBuyer: process.rootBuyer,
            currency: process.currency,
            cumulativeValue: process.cumulativeValue,
            activeOrderCount: [...process.orders.values()].filter(
                (o) => o.state === OS.Active,
            ).length,
            resolved: process.resolved,
            orders,
        };
    }

    // ── Internal event handlers ─────────────────────────────────────────────

    private applyOrderCommitted(e: OrderCommittedEvent): void {
        const order: Order = {
            orderHash: e.orderHash,
            processId: e.processId,
            buyer: e.buyer,
            seller: e.seller,
            currency: e.currency,
            payment: e.payment,
            cumulativeValue: e.cumulativeValue,
            agreementHash: e.agreementHash,
            salt: e.salt,
            deadline: e.deadline,
            state: OS.Active,
            blockNumber: e.blockNumber,
        };

        this.orderIndex.set(e.orderHash, order);

        let process = this.processes.get(e.processId);
        if (!process) {
            process = {
                processId: e.processId,
                rootBuyer: e.buyer,
                currency: e.currency,
                cumulativeValue: e.cumulativeValue,
                orders: new Map(),
                resolved: false,
            };
            this.processes.set(e.processId, process);
        } else {
            // Update cumulative value (monotonic — always grows)
            if (e.cumulativeValue > process.cumulativeValue) {
                process.cumulativeValue = e.cumulativeValue;
            }
        }

        process.orders.set(e.orderHash, order);
    }

    private applyOrderResolved(e: OrderResolvedEvent): void {
        const order = this.orderIndex.get(e.orderHash);
        if (!order) return;

        order.state = OS.Resolved;
        order.sellerPayout = e.sellerPayout;
        order.buyerPayout = e.buyerPayout;
    }

    private applyProcessResolved(e: ProcessResolvedEvent): void {
        const process = this.processes.get(e.processId);
        if (!process) return;

        process.resolved = true;
    }
}
