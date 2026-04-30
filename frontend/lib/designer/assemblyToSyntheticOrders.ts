/**
 * assemblyToSyntheticOrders — bridges a forked Assembly into the DAG editor's
 * synthetic-session worldview.
 *
 * The DAG editor at /builders/designer/new operates on Order[] backed by an
 * in-memory `SyntheticProcessSession` (see `lib/designer/syntheticProcess.ts`).
 * /builders/designer/edit/[slug] needs to mount the same editor pre-populated
 * with a tree representing a reference Assembly so the user can modify it.
 *
 * Heuristic for the canonical tree:
 * - The first non-buyer role becomes the root order's seller (root = buyer →
 *   first seller-role).
 * - Every additional non-buyer role becomes a sub-order seller. Sub-orders
 *   share the root buyer per the kernel's "one buyer dominance" topology.
 * - If any mechanism has `kind === "auction"` and is enabled, the LAST
 *   sub-order's fulfilment method is set to `deliver:dutch-auction` (the
 *   convention is that auctions allocate the final downstream leg, e.g.,
 *   delivery in local-commerce).
 *
 * Edge cases the bridge does NOT model — the user grows the tree manually:
 *   - Multi-auction assemblies (two parallel auctions, etc.).
 *   - Diamond / fan-in topologies (sub-order with multiple parents).
 *   - Mechanisms that don't imply orders (disclosure, attestation, registry,
 *     coordinator, registration). Those manifest at runtime through their
 *     bound modules, not as DAG nodes.
 *
 * Empty- or buyer-only roles fall back to a single blank root (same as /new).
 */

import type { Assembly } from "@/lib/shared/assembly";
import type { Order } from "@/lib/core/store";
import {
    type SyntheticProcessSession,
    startSyntheticSession,
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    swapSyntheticFulfilmentMethod,
} from "@/lib/designer/syntheticProcess";

export interface SeededDesignSession {
    session: SyntheticProcessSession;
    orders: Order[];
}

export function assemblyToSyntheticOrders(assembly: Assembly): SeededDesignSession {
    const session = startSyntheticSession();

    const sellerRoles = (assembly.roles ?? []).filter((r) => r.roleKind !== "buyer");

    if (sellerRoles.length === 0) {
        const root = createSyntheticRootOrder(session);
        return { session, orders: [root.order] };
    }

    const root = createSyntheticRootOrder(session);
    const subRoles = sellerRoles.slice(1);

    let subOrders: Order[] = subRoles.map(() => createSyntheticSubOrder(session, root.order).order);

    const hasAuctionMechanism = (assembly.mechanisms ?? []).some(
        (m) => m.kind === "auction" && m.enabled,
    );
    if (hasAuctionMechanism && subOrders.length > 0) {
        const lastIndex = subOrders.length - 1;
        subOrders = subOrders.map((order, i) =>
            i === lastIndex ? swapSyntheticFulfilmentMethod(order, "deliver:dutch-auction") : order,
        );
    }

    return { session, orders: [root.order, ...subOrders] };
}
