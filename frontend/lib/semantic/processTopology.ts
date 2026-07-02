/**
 * processTopology.ts — reconstruct a process's order DAG off-chain.
 *
 * Topology is a clause like any other, and a STRUCTURAL one: every committed
 * agreement carries the topology section (mandatory, like commerce), so an
 * order's parents are always readable BY FIELD NAME (`parentOrderHashes`) via
 * `agreementSections` — no privileged topology read path, no stored mode, and
 * NO invented edges: an agreement not yet hydrated from IPFS renders edgeless
 * until it loads (loading, never fabrication). Topology is an organizational
 * element of a process — UI reconstruction + seller coordination — and is
 * independent of bonding, which is ALWAYS linear and on-chain. What remains
 * here is the by-field read plus generic graph math (topological order,
 * depth). The agreements Map is supplied by the caller (render path:
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

export function deriveOrderTopology(
    orders: Order[],
    agreements: Map<string, Agreement>,
): Map<string, OrderTopologyInfo> {
    const topology = new Map<string, OrderTopologyInfo>();
    for (const order of orders) {
        // Design-time: a designer draft carries its edges directly (the canvas
        // is the origin of the topology clause's data, pre-commit).
        if (order.parentOrderHashes !== undefined) {
            topology.set(order.id, {
                parentOrderHashes: order.parentOrderHashes,
                sourceLabel: "first-class design-time topology (the topology clause)",
            });
            continue;
        }

        // Committed: the mandatory structural topology section, read by field.
        const agreement = order.agreementHash ? (agreements.get(order.agreementHash) ?? null) : null;
        const explicitParents = topologyParentOrderHashes(agreement);
        if (explicitParents !== null) {
            topology.set(order.id, {
                parentOrderHashes: explicitParents,
                sourceLabel: "agreement topology section committed through agreementHash",
            });
            continue;
        }

        // Agreement not hydrated yet (IPFS fetch pending). Topology is
        // structural — the section EXISTS on-chain-committed; we just can't
        // read it yet. Edgeless until it loads; NEVER invented edges.
        topology.set(order.id, {
            parentOrderHashes: [],
            sourceLabel: "agreement not yet hydrated — edges pending",
        });
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
