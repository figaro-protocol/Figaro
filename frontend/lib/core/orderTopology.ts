import { loadAgreement } from "@/lib/core/agreementStore";
import { type Agreement, type TopologyMode } from "@/lib/core/agreement";
import {
    getTopologyMode,
    getTopologyParentOrderHashes,
} from "@/lib/core/orderAgreement";
import type { Order } from "@/lib/core/store";

export interface OrderTopologyInfo {
    parentOrderHashes: string[];
    topologyMode: TopologyMode;
    sourceLabel: string;
}

function compareOrders(left: Order, right: Order): number {
    if (left.cumulativeValue !== right.cumulativeValue) {
        return left.cumulativeValue < right.cumulativeValue ? -1 : 1;
    }

    const leftBlock = left.blockNumber ?? left.timestamp ?? 0;
    const rightBlock = right.blockNumber ?? right.timestamp ?? 0;
    if (leftBlock !== rightBlock) {
        return leftBlock - rightBlock;
    }

    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
}

function sortOrdersForTopology(orders: Order[]): Order[] {
    return [...orders].sort(compareOrders);
}

/**
 * Build an agreements Map from the localStorage cache for callers that
 * are guaranteed hot-cache by construction (designer sessions where the
 * author just wrote the agreement; unit tests that seed localStorage in
 * the same tick). Render-path consumers cross-wallet should obtain the
 * Map from `useProcessAgreements` instead — see
 * `feedback_ipfs_hydrated_agreements`.
 */
export function buildAgreementsFromCache(orders: Order[]): Map<string, Agreement> {
    const map = new Map<string, Agreement>();
    for (const order of orders) {
        if (!order.agreementHash) continue;
        const agreement = loadAgreement(order.agreementHash);
        if (agreement) map.set(order.agreementHash, agreement);
    }
    return map;
}

export function deriveOrderTopology(
    orders: Order[],
    agreements: Map<string, Agreement>,
): Map<string, OrderTopologyInfo> {
    const sortedOrders = sortOrdersForTopology(orders);
    const fallbackTopology = new Map<string, OrderTopologyInfo>();

    sortedOrders.forEach((order, index) => {
        fallbackTopology.set(order.id, {
            parentOrderHashes: index === 0 ? [] : [sortedOrders[index - 1].id],
            topologyMode: index === 0 ? "root" : "linear-fallback",
            sourceLabel: index === 0
                ? "first order in cumulative process progression"
                : "linear fallback derived from cumulative process progression",
        });
    });

    const topology = new Map<string, OrderTopologyInfo>();
    for (const order of orders) {
        const fallback = fallbackTopology.get(order.id) ?? {
            parentOrderHashes: [],
            topologyMode: "root" as const,
            sourceLabel: "default root fallback",
        };

        // First-class design-time topology: when the order carries its topology edges
        // directly (the designer set them), use them — never round-trip through
        // the agreement. Runtime/chain orders have no parentOrderHashes; their
        // topology is recovered from the committed agreement section below.
        if (order.parentOrderHashes !== undefined) {
            topology.set(order.id, {
                parentOrderHashes: order.parentOrderHashes,
                topologyMode: order.parentOrderHashes.length === 0 ? "root" : "explicit",
                sourceLabel: "first-class design-time topology (the topology clause)",
            });
            continue;
        }

        const agreement = order.agreementHash
            ? (agreements.get(order.agreementHash) ?? null)
            : null;
        const explicitParents = getTopologyParentOrderHashes(agreement);
        const explicitMode = getTopologyMode(agreement);

        if (explicitParents !== null || explicitMode !== null) {
            const parentOrderHashes = explicitParents ?? [];
            const topologyMode = parentOrderHashes.length === 0
                ? "root"
                : explicitMode === "linear-fallback"
                    ? "linear-fallback"
                    : "explicit";

            topology.set(order.id, {
                parentOrderHashes,
                topologyMode,
                sourceLabel: "agreement topology section committed through agreementHash",
            });
            continue;
        }

        topology.set(order.id, fallback);
    }

    return topology;
}

/**
 * Topological order of `ids` — every node appears after all its in-set parents.
 * `parentIdsOf(id)` returns a node's parent ids; parents outside `ids` and
 * self-parents are ignored. Stable: ready nodes are emitted in input order
 * (so a per-clause commit cursor stays deterministic).
 *
 * `onCycle` is the one policy the two call sites genuinely differ on:
 *   - "throw" — reject a cyclic topology (the commit path's load-bearing guard; the
 *     caller catches it and degrades the UI).
 *   - "break" — emit the still-unsettled nodes in input order, treating the
 *     cycle edge as absent, so a display metric degrades instead of crashing.
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

export function deriveOrderDepths(orders: Order[], topology: Map<string, OrderTopologyInfo>): Map<string, number> {
    const order = topologicalOrder(
        orders.map((o) => o.id),
        (id) => topology.get(id)?.parentOrderHashes ?? [],
        "break",
    );
    const depthMap = new Map<string, number>();
    for (const orderId of order) {
        // Parents already placed (topo order guarantees it for an acyclic topology; a cycle
        // back-edge is simply not yet in the map and so contributes nothing).
        const parentDepths = (topology.get(orderId)?.parentOrderHashes ?? [])
            .filter((parentId) => parentId !== orderId && depthMap.has(parentId))
            .map((parentId) => depthMap.get(parentId)!);
        depthMap.set(orderId, parentDepths.length === 0 ? 0 : Math.max(...parentDepths) + 1);
    }
    return depthMap;
}
