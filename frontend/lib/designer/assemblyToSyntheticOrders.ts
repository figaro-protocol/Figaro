/**
 * assemblyToSyntheticOrders — bridges a forked Assembly into the DAG editor's
 * synthetic-session worldview.
 *
 * The DAG editor at /builders/designer/new operates on Order[] backed by an
 * in-memory `SyntheticProcessSession` (see `lib/designer/syntheticProcess.ts`).
 * /builders/designer/edit/[slug] needs to mount the same editor pre-populated
 * with a tree representing a reference Assembly so the user can modify it.
 *
 * Topology heuristic:
 * - The first non-buyer role becomes the root order's seller (root = buyer →
 *   first seller-role).
 * - Every additional non-buyer role becomes a sub-order seller. Sub-orders
 *   share the root buyer per the kernel's "one buyer dominance" topology.
 *
 * Fulfilment heuristic:
 * - Root order: if `assembly.defaultRootFulfilment` is set, the root is
 *   swapped to that method. Otherwise the synthetic default
 *   (`deliver:seller-assigned`) applies.
 * - Sub-order edges: if any mechanism has `kind === "auction"` and is
 *   enabled, the LAST sub-order's fulfilment is set to `deliver:dutch-auction`
 *   (the convention is that auctions allocate the final downstream leg).
 *   Otherwise sub-orders inherit the synthetic default.
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
    const defaultRoot = assembly.defaultRootFulfilment;

    if (sellerRoles.length === 0) {
        const seed = createSyntheticRootOrder(session);
        const root = defaultRoot
            ? swapSyntheticFulfilmentMethod(seed.order, defaultRoot)
            : seed.order;
        return { session, orders: [root] };
    }

    const seed = createSyntheticRootOrder(session);
    const root = defaultRoot
        ? swapSyntheticFulfilmentMethod(seed.order, defaultRoot)
        : seed.order;

    const subRoles = sellerRoles.slice(1);
    let subOrders: Order[] = subRoles.map(() => createSyntheticSubOrder(session, root).order);

    const hasAuctionMechanism = (assembly.mechanisms ?? []).some(
        (m) => m.kind === "auction" && m.enabled,
    );
    if (hasAuctionMechanism && subOrders.length > 0) {
        const lastIndex = subOrders.length - 1;
        subOrders = subOrders.map((order, i) =>
            i === lastIndex ? swapSyntheticFulfilmentMethod(order, "deliver:dutch-auction") : order,
        );
    }

    return { session, orders: [root, ...subOrders] };
}
