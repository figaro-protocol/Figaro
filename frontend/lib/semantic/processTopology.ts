/**
 * processTopology.ts — reconstruct a process's order DAG off-chain.
 *
 * Topology is a clause like any other: an order's parents are read BY FIELD
 * NAME (`parentOrderHashes`) from its committed agreement via
 * `agreementSections` — no privileged topology read path, no `orderTopology`
 * module, and no stored mode (the mode is DERIVED from the edges). What remains
 * here is generic graph math (topological order, depth) plus the fallback that
 * linearizes a chain by cumulative value when an order carries no explicit
 * edges. The agreements Map is supplied by the caller (render path:
 * `useProcessAgreements`); this module never fetches.
 */
import type { Agreement } from "@figaro/core";
import type { Order } from "@/lib/core/store";
import { sectionByField } from "@/lib/core/agreementSections";

/** The ONLY topology data is the parent edges. There is no mode — the
 *  kernel's bonding is linear and on-chain (cumulative value); the DAG is
 *  off-chain display data. `sourceLabel` is provenance prose (where the
 *  edges were read from), not a taxonomy. */
export interface OrderTopologyInfo {
    parentOrderHashes: string[];
    sourceLabel: string;
}

// ── By-field reads of the topology clause (no clause id named) ────────────────

function topologyParentOrderHashes(agreement: Agreement | null | undefined): string[] | null {
    if (!agreement) return null;
    const section = sectionByField(agreement, "parentOrderHashes");
    if (!section) return null;
    const raw = (section.data as Record<string, unknown>).parentOrderHashes;
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

// ── Topology derivation ───────────────────────────────────────────────────────

function compareOrders(left: Order, right: Order): number {
    if (left.cumulativeValue !== right.cumulativeValue) {
        return left.cumulativeValue < right.cumulativeValue ? -1 : 1;
    }
    const leftBlock = left.blockNumber ?? left.timestamp ?? 0;
    const rightBlock = right.blockNumber ?? right.timestamp ?? 0;
    if (leftBlock !== rightBlock) return leftBlock - rightBlock;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
}

export function deriveOrderTopology(
    orders: Order[],
    agreements: Map<string, Agreement>,
): Map<string, OrderTopologyInfo> {
    const sortedOrders = [...orders].sort(compareOrders);
    const fallbackTopology = new Map<string, OrderTopologyInfo>();
    sortedOrders.forEach((order, index) => {
        fallbackTopology.set(order.id, {
            parentOrderHashes: index === 0 ? [] : [sortedOrders[index - 1].id],
            sourceLabel: index === 0
                ? "first order in cumulative process progression"
                : "linearized from cumulative process progression",
        });
    });

    const topology = new Map<string, OrderTopologyInfo>();
    for (const order of orders) {
        const fallback = fallbackTopology.get(order.id) ?? {
            parentOrderHashes: [],
            sourceLabel: "default fallback (no edges)",
        };

        // First-class design-time topology: when the order carries its edges
        // directly (the designer set them), use them. Runtime/chain orders have
        // no parentOrderHashes; their topology is recovered from the committed
        // agreement section below.
        if (order.parentOrderHashes !== undefined) {
            topology.set(order.id, {
                parentOrderHashes: order.parentOrderHashes,
                sourceLabel: "first-class design-time topology (the topology clause)",
            });
            continue;
        }

        const agreement = order.agreementHash ? (agreements.get(order.agreementHash) ?? null) : null;
        const explicitParents = topologyParentOrderHashes(agreement);

        if (explicitParents !== null) {
            topology.set(order.id, {
                parentOrderHashes: explicitParents,
                sourceLabel: "agreement topology section committed through agreementHash",
            });
            continue;
        }

        topology.set(order.id, fallback);
    }

    return topology;
}

// ── Generic DAG math ──────────────────────────────────────────────────────────

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

export function deriveOrderDepths(
    orders: Order[],
    topology: Map<string, OrderTopologyInfo>,
): Map<string, number> {
    const order = topologicalOrder(
        orders.map((o) => o.id),
        (id) => topology.get(id)?.parentOrderHashes ?? [],
        "break",
    );
    const depth = new Map<string, number>();
    for (const id of order) {
        const parents = topology.get(id)?.parentOrderHashes ?? [];
        const parentDepths = parents.map((p) => depth.get(p) ?? 0);
        depth.set(id, parents.length === 0 ? 0 : Math.max(...parentDepths) + 1);
    }
    return depth;
}
