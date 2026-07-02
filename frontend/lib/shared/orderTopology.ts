/**
 * orderTopology.ts — generic order-topology math, shared by every tier.
 *
 * Topology is organizational (UI reconstruction + seller coordination) and
 * independent of bonding, which is ALWAYS linear and on-chain. This module is
 * the pure math over parent edges — no agreement reading, no chain access,
 * structural types only (shared/ imports nothing above it). Reading a
 * COMMITTED order's edges out of its agreement's structural topology section
 * is a runtime concern and lives in `lib/semantic/processTopology.ts`.
 */

/** Topology read from first-class draft edges: order id → parent order ids.
 *  A designer draft ALWAYS carries its edges directly on the order
 *  (`parentOrderHashes` — the canvas is the origin of the topology clause's
 *  data, pre-commit), so draft topology never touches an agreement. */
export function draftOrderTopology(
    orders: readonly { id: string; parentOrderHashes?: string[] }[],
): Map<string, string[]> {
    return new Map(orders.map((o) => [o.id, o.parentOrderHashes ?? []]));
}

/**
 * Topological order of `ids` — every node after all its in-set parents.
 * Parents outside `ids` and self-parents are ignored. Stable: ready nodes emit
 * in input order. `onCycle`: "throw" rejects a cyclic topology (commit-path
 * guard); "break" emits unsettled nodes in input order (display degrades).
 */
export function topologicalOrder(
    ids: string[],
    parentIdsOf: (id: string) => string[],
    onCycle: "throw" | "break",
): string[] {
    const idSet = new Set(ids);
    const parentsOf = (id: string) =>
        parentIdsOf(id).filter((parentId) => parentId !== id && idSet.has(parentId));
    const settled = new Set<string>();
    const ordered: string[] = [];
    const pending = [...ids];
    while (pending.length > 0) {
        const idx = pending.findIndex((id) => parentsOf(id).every((p) => settled.has(p)));
        if (idx === -1) {
            if (onCycle === "throw") {
                throw new Error("Topology has a cycle — a node's parents are unresolvable.");
            }
            for (const id of pending) { settled.add(id); ordered.push(id); }
            break;
        }
        const [next] = pending.splice(idx, 1);
        settled.add(next);
        ordered.push(next);
    }
    return ordered;
}

/** Depth per order id — root = 0, child = max(parent depths) + 1. */
export function deriveOrderDepths(
    orders: readonly { id: string }[],
    topology: Map<string, string[]>,
): Map<string, number> {
    const order = topologicalOrder(
        orders.map((o) => o.id),
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
