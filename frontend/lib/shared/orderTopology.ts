/**
 * orderTopology.ts — draft-edge topology reads for the canvas tier.
 *
 * Topology is organizational (UI reconstruction + seller coordination) and
 * independent of bonding, which is ALWAYS linear and on-chain. The generic
 * topological sort lives in `@figaro-protocol/sdk` (`topologicalOrder`) — the ONE home
 * the template walk, the sub-order plan, and the depth derivation below all
 * order by. Reading a COMMITTED order's edges out of its agreement's
 * mandatory topology section is a runtime concern and lives in
 * `lib/semantic/processTopology.ts`.
 */

import { topologicalOrder } from "@figaro-protocol/sdk";

/** Topology read from first-class draft edges: order id → parent order ids.
 *  A designer draft ALWAYS carries its edges directly on the order
 *  (`parentOrderHashes` — the canvas is the origin of the topology clause's
 *  data, pre-commit), so draft topology never touches an agreement. */
export function draftOrderTopology(
    orders: readonly { orderHash: string; parentOrderHashes?: string[] }[],
): Map<string, string[]> {
    return new Map(orders.map((o) => [o.orderHash, o.parentOrderHashes ?? []]));
}

/** Depth per order id — root = 0, child = max(parent depths) + 1. */
export function deriveOrderDepths(
    orders: readonly { orderHash: string }[],
    topology: Map<string, string[]>,
): Map<string, number> {
    const order = topologicalOrder(
        orders.map((o) => o.orderHash),
        (id) => topology.get(id) ?? [],
        "break",
    );
    const depth = new Map<string, number>();
    for (const id of order) {
        const parents = topology.get(id) ?? [];
        const parentDepths = parents.map((p) => depth.get(p) ?? 0);
        depth.set(id, parents.length === 0 ? 0 : Math.max(...parentDepths) + 1);
    }
    return depth;
}
