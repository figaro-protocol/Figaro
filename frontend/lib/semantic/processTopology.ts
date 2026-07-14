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
 * here is the by-field read of the committed section; the generic graph math
 * (topological order, depth, draft edges) lives in `lib/shared/orderTopology`.
 * The agreements Map is supplied by the caller (render path:
 * `useProcessAgreements`); this module never fetches.
 */
import type { Agreement } from "@figaro/sdk";
import type { Order } from "@/lib/kernel/store";
import { sectionByField } from "@figaro/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";

// ── By-field reads of the topology clause (no clause id named) ────────────────

function topologyParentOrderHashes(agreement: Agreement | null | undefined): string[] | null {
    if (!agreement) return null;
    const section = sectionByField(agreement, "parentOrderHashes", specSource());
    if (!section) return null;
    const raw = (section.data as Record<string, unknown>).parentOrderHashes;
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

// ── Topology derivation ───────────────────────────────────────────────────────

/** The ONLY topology data is the parent edges: order id → parent order ids.
 *  Two sources: a designer draft carries its edges directly (the canvas is
 *  the origin of the topology clause's data, pre-commit); a committed order's
 *  edges are read from its agreement's mandatory topology section.
 *  An agreement not yet hydrated from IPFS yields [] — edgeless until it
 *  loads, NEVER invented edges. */
export function deriveOrderTopology(
    orders: Order[],
    agreements: Map<string, Agreement>,
): Map<string, string[]> {
    const topology = new Map<string, string[]>();
    for (const order of orders) {
        if (order.parentOrderHashes !== undefined) {
            topology.set(order.orderHash, order.parentOrderHashes);
            continue;
        }
        const agreement = order.agreementHash ? (agreements.get(order.agreementHash) ?? null) : null;
        topology.set(order.orderHash, topologyParentOrderHashes(agreement) ?? []);
    }
    return topology;
}
