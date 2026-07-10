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
import { templateParentOrderHashes, type TemplateAgreement } from "@/lib/shared/assemblyTemplate";
import { topologicalOrder } from "@/lib/shared/orderTopology";
import type { SellerCatalogue } from "@/lib/seller/types";
import type { CatalogueItemMetadata } from "@/lib/seller/sellerCatalogueMetadata";
import { hexEqual } from "@/lib/shared/evm";
import { parseToken } from "@/lib/shared/utils";
import { getRateQuantityResolver } from "@/lib/checkout/rateQuantitySources";

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
): Array<{ node: TemplateAgreement; seller: `0x${string}` | null }> {
    const { assemblyTemplate } = assembly;
    const byId = new Map(assemblyTemplate.agreements.map((o) => [o.id, o]));
    const rootId =
        assemblyTemplate.agreements.find((o) => templateParentOrderHashes(o).length === 0)?.id ??
        assemblyTemplate.agreements[0]?.id;
    // Topological order (throws on a cyclic topology — the guard the checkout relies on),
    // then the sub-orders are everything but the root, in commit order.
    const ordered: TemplateAgreement[] = topologicalOrder(
        assemblyTemplate.agreements.map((o) => o.id),
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

/** A sub-order's full pricing statement — the ONE figure set both the cart
 *  breakdown (display) and the checkout walk (commit) read, so they cannot
 *  drift. `billedQuantity × unitPrice = payment` always holds, making the
 *  committed line item replay the payment with no reference back to the
 *  (mutable) catalogue. */
export interface SubOrderPricing {
    /** The catalogue item priced — the contributor's first available item;
     *  null when the contributor publishes none. */
    item: CatalogueItemMetadata | null;
    /** The payment the buyer signs, in the currency's smallest unit. 0n when
     *  unpriceable (no item, or a rate quantity that doesn't resolve). */
    payment: bigint;
    /** The committed line-item quantity: 1 for fixed items; for rate items
     *  the billed count — per STARTED unit, max(1, ceil(resolvedUnits)). */
    billedQuantity: number;
    /** The committed line-item unitPrice: the full payment for fixed items;
     *  the per-unit rate for rate items. */
    unitPrice: bigint;
    /** The raw resolved units before per-started-unit rounding (e.g. 4.2 km)
     *  — display only; null for fixed items or when unresolvable. */
    resolvedUnits: number | null;
    /** Why the pricing is 0n, when it is. */
    issue?: "no-item" | "unresolvable-quantity";
}

/**
 * Price a sub-order from its contributor's OWN catalogue — the lead included.
 * The template carries no payment (it's a runtime value), so the figure is
 * resolved LIVE from the pricing seller's catalogue — the same path the
 * delivery leg uses, minus the picker. The item rule is the contributor's
 * first available item (open refinement, kit-assembly: an itemId on the
 * binding — catalogue categories are seller-authored free-form values, never
 * a closed set this code may branch on).
 *
 * A `pricingPolicy: "rate"` item prices as rate × quantity, the quantity
 * resolved through the rate-quantity-source registry from the order's OWN
 * clause fields (e.g. committed geolocation endpoints) or the buyer's
 * checkout-entered units — billed per started unit. An unresolvable quantity
 * yields payment 0n + `issue`, and the surface refuses to commit (the
 * commerce clause's `payment ≥ 1` would reject it at Layer A regardless).
 */
export function resolveSubOrderPricing(args: {
    node: TemplateAgreement;
    seller: `0x${string}`;
    sellerCatalogues: SellerCatalogue[];
    tokenDecimals: number;
    /** The buyer's entered units for this node (the "checkout-quantity"
     *  source's input), when the surface collected one. */
    checkoutQuantity?: number;
}): SubOrderPricing {
    const catalogue = args.sellerCatalogues.find((c) => hexEqual(c.address, args.seller));
    const item = catalogue?.items.find((i) => i.available !== false) ?? null;
    if (!item) {
        return { item: null, payment: 0n, billedQuantity: 1, unitPrice: 0n, resolvedUnits: null, issue: "no-item" };
    }
    if (item.pricingPolicy !== "rate") {
        const payment = parseToken(item.price, args.tokenDecimals);
        return { item, payment, billedQuantity: 1, unitPrice: payment, resolvedUnits: null };
    }
    const resolver = getRateQuantityResolver(item.rateQuantitySource);
    const units = resolver?.({ clauses: args.node.clauses, checkoutQuantity: args.checkoutQuantity }) ?? null;
    if (units === null) {
        return { item, payment: 0n, billedQuantity: 1, unitPrice: 0n, resolvedUnits: null, issue: "unresolvable-quantity" };
    }
    const billedQuantity = Math.max(1, Math.ceil(units));
    const unitPrice = parseToken(item.price, args.tokenDecimals);
    return {
        item,
        payment: unitPrice * BigInt(billedQuantity),
        billedQuantity,
        unitPrice,
        resolvedUnits: units,
    };
}
