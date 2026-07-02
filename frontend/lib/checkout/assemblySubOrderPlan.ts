/**
 * Pricing + seller resolution for an assembly's sub-orders.
 *
 * Shared by the seller checkout (which commits) and the cart breakdown
 * (which displays the price) so the figure the buyer sees is exactly the
 * figure that commits — they read the SAME seller and the SAME payment per
 * node and cannot drift apart.
 *
 * The model mirrors the delivery leg: a contributor is sovereign over its
 * price, which lives in the contributor's OWN catalogue (a public rate, plus
 * an optional rate negotiated with a counterparty). Nothing is copied into the
 * lead's assembly. The lead's own orders are priced from the assembly the lead
 * authored (the assemblyTemplate figure).
 */

import type { BoundAssembly } from "@/lib/seller/useSellerBoundAssemblies";
import { templateParentOrderHashes, type AssemblyTemplateOrder } from "@/lib/shared/assemblyTemplate";
import { topologicalOrder } from "@/lib/semantic/processTopology";
import type { SellerCatalogue } from "@/lib/seller/types";
import { hexEqual } from "@/lib/shared/evm";
import { parseToken } from "@/lib/shared/utils";

/**
 * Topologically order an assembly's non-root orders and resolve each one's
 * seller from the seller's counterparty bindings. A clause shared by sibling
 * orders draws distinct wallets by commit order (the per-clause cursor), so the
 * ordering is significant and must match the checkout's commit order. `seller`
 * is `null` when the assembly binds no counterparty for that order's clause.
 *
 * Throws when the topology has a cycle (a sub-order's parents are
 * unresolvable) — the same guard the checkout relies on.
 */
export function planSubOrderSellers(
    assembly: BoundAssembly,
): Array<{ node: AssemblyTemplateOrder; seller: `0x${string}` | null }> {
    const { assemblyTemplate } = assembly;
    const byId = new Map(assemblyTemplate.orders.map((o) => [o.id, o]));
    const rootId =
        assemblyTemplate.orders.find((o) => templateParentOrderHashes(o).length === 0)?.id ??
        assemblyTemplate.orders[0]?.id;
    // Topological order (throws on a cyclic topology — the guard the checkout relies on),
    // then the sub-orders are everything but the root, in commit order.
    const ordered: AssemblyTemplateOrder[] = topologicalOrder(
        assemblyTemplate.orders.map((o) => o.id),
        (id) => templateParentOrderHashes(byId.get(id)!),
        "throw",
    )
        .filter((id) => id !== rootId)
        .map((id) => byId.get(id)!);
    const cursor = new Map<string, number>();
    return ordered.map((node) => {
        const nodeClauses = Object.keys(node.clauses);
        const binding = assembly.counterpartyBindings.find((cb) => nodeClauses.includes(cb.clauseId));
        if (!binding || binding.addresses.length === 0) return { node, seller: null };
        const c = cursor.get(binding.clauseId) ?? 0;
        cursor.set(binding.clauseId, c + 1);
        return { node, seller: binding.addresses[Math.min(c, binding.addresses.length - 1)] as `0x${string}` };
    });
}

/**
 * Resolve a sub-order's payment as a bigint.
 *
 * Every seller prices from its OWN catalogue — the lead included. The template
 * carries no payment (it's a runtime value), so the figure is resolved LIVE
 * from the pricing seller's catalogue (the published item price) — the same
 * path the delivery leg uses, minus the picker. Returns 0n when the seller
 * publishes no matching item.
 *
 * Open refinement (kit-assembly): the node→catalogue-item mapping is currently
 * the seller's first available item — catalogue categories are seller-authored
 * free-form values, never a closed set this code may branch on. A richer rule
 * (itemId on the binding) is the remaining decision.
 */
export function resolveSubOrderPayment(args: {
    node: AssemblyTemplateOrder;
    seller: `0x${string}`;
    sellerCatalogues: SellerCatalogue[];
    tokenDecimals: number;
}): bigint {
    const { seller, sellerCatalogues, tokenDecimals } = args;
    const catalogue = sellerCatalogues.find((c) => hexEqual(c.address, seller));
    const item = catalogue?.items.find((i) => i.available !== false);
    if (!item) return 0n;
    return parseToken(item.price, tokenDecimals);
}
