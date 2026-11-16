/**
 * processTopology.ts — reconstruct a process's order DAG off-chain.
 *
 * Topology is the agreement FORMAT's own leaf (`Agreement.follows`), never a
 * clause: every agreement checkout builds from a design carries it — the
 * order hashes of the orders the order follows, `[]` for a root — so an
 * order's parents are read straight off the signed agreement, with no spec
 * read and NO invented edges. An order whose agreement is absent, unread or
 * carries no topology leaf has UNKNOWN edges, kept apart from an empty leaf:
 * it renders edgeless and is never named a root on that ground. The root of
 * a process is the chain's (`isProcessRoot`), never read off a leaf. Topology is an
 * organizational element of a process — UI reconstruction + seller
 * coordination — and is independent of bonding, which is ALWAYS linear and
 * on-chain. What remains here is the read of the committed leaf; the generic
 * graph math (topological order, depth, draft edges) lives in
 * `lib/shared/orderTopology`. The agreements Map is supplied by the caller
 * (render path: `useProcessAgreements`); this module never fetches.
 */
import type { Agreement } from "@figaro-protocol/sdk";
import type { Order } from "@/lib/core/store";

// ── The read of the topology leaf ─────────────────────────────────────────────

/** The parent order ids an agreement's topology leaf names: null when the
 *  agreement carries no topology leaf (one built without a design), [] for a
 *  root; empty and blank ids are dropped. */
export function topologyFollows(agreement: Agreement | null | undefined): string[] | null {
    if (!agreement) return null;
    const raw: unknown = agreement.follows;
    if (raw === undefined) return null;
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

// ── Topology derivation ───────────────────────────────────────────────────────

/** The ONLY topology data is the parent edges: order id → parent order ids.
 *  Two sources: a designer draft carries its edges directly (the canvas is
 *  the origin of each entry's `follows`, pre-commit); a committed order's
 *  edges are read from its agreement's topology leaf.
 *  An order whose edges are unknown (its agreement absent, not yet hydrated
 *  from IPFS, failed to load, or carrying no topology leaf) has NO entry:
 *  `get` answers `undefined`, never `[]`, and NEVER invented edges. */
export function deriveOrderTopology(
    orders: Order[],
    agreements: Map<string, Agreement>,
): Map<string, string[]> {
    const topology = new Map<string, string[]>();
    for (const order of orders) {
        if (order.follows !== undefined) {
            topology.set(order.orderHash, order.follows);
            continue;
        }
        const agreement = order.checkoutHash ? (agreements.get(order.checkoutHash) ?? null) : null;
        const follows = topologyFollows(agreement);
        if (follows !== null) topology.set(order.orderHash, follows);
    }
    return topology;
}
