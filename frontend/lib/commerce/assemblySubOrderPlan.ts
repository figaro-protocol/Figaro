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

import type { BoundAssembly } from "@/lib/mechanisms/useAssemblyRegistry";
import { templateParentOrderIds } from "@/lib/designer/assemblyTemplate";
import type { SellerCatalogue } from "@/lib/seller/types";
import { resolveCatalogueItemPrice } from "@/lib/shared/sellerCatalogueMetadata";
import { hexEqual } from "@/lib/shared/evm";
import { parseToken } from "@/lib/shared/utils";

export type AssemblyTemplateOrder = BoundAssembly["assemblyTemplate"]["orders"][number];

/**
 * Topologically order an assembly's non-root orders and resolve each one's
 * seller from the seller's counterparty bindings. A clause shared by sibling
 * orders draws distinct wallets by commit order (the per-clause cursor), so the
 * ordering is significant and must match the checkout's commit order. `seller`
 * is `null` when the assembly binds no counterparty for that order's clause.
 *
 * Throws when the topology is not a DAG (a sub-order's parents are
 * unresolvable) — the same guard the checkout relies on.
 */
export function planSubOrderSellers(
    assembly: BoundAssembly,
): Array<{ node: AssemblyTemplateOrder; seller: `0x${string}` | null }> {
    const { assemblyTemplate } = assembly;
    const rootId =
        assemblyTemplate.orders.find((o) => templateParentOrderIds(o).length === 0)?.id ??
        assemblyTemplate.orders[0]?.id;
    const settled = new Set<string>(rootId ? [rootId] : []);
    const pending = assemblyTemplate.orders.filter((o) => o.id !== rootId);
    const ordered: AssemblyTemplateOrder[] = [];
    while (pending.length > 0) {
        const idx = pending.findIndex((o) => templateParentOrderIds(o).every((p) => settled.has(p)));
        if (idx === -1) {
            throw new Error("Assembly topology is not a DAG — a sub-order's parents are unresolvable.");
        }
        const [next] = pending.splice(idx, 1);
        settled.add(next.id);
        ordered.push(next);
    }
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
 * from the pricing seller's catalogue via `resolveCatalogueItemPrice` (the rate
 * negotiated with the lead if one exists, else the public price) — the same
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
    leadAddress: `0x${string}`;
    sellerCatalogues: SellerCatalogue[];
    tokenDecimals: number;
}): bigint {
    const { seller, leadAddress, sellerCatalogues, tokenDecimals } = args;
    const catalogue = sellerCatalogues.find((c) => hexEqual(c.address, seller));
    const item = catalogue?.menu.find((i) => i.available !== false);
    if (!item) return 0n;
    return parseToken(resolveCatalogueItemPrice(item, leadAddress).price, tokenDecimals);
}
