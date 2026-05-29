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
 * authored (the manifest figure).
 */

import type { BoundAssembly } from "@/lib/mechanisms/useAssemblyRegistry";
import type { SellerCatalogue } from "@/lib/seller/types";
import { getTopologyParentOrderHashes } from "@/lib/core/orderAgreement";
import { resolveCatalogueItemPrice } from "@/lib/shared/sellerCatalogueMetadata";
import { hexEqual } from "@/lib/shared/evm";
import { parseToken } from "@/lib/shared/utils";

export type AssemblyDocumentOrder = BoundAssembly["manifest"]["orders"][number];

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
): Array<{ node: AssemblyDocumentOrder; seller: `0x${string}` | null }> {
    const { manifest } = assembly;
    const rootId = manifest.orders[0]?.id;
    const settled = new Set<string>(rootId ? [rootId] : []);
    const pending = manifest.orders.filter((o) => o.id !== rootId);
    const ordered: AssemblyDocumentOrder[] = [];
    while (pending.length > 0) {
        const idx = pending.findIndex((o) =>
            (getTopologyParentOrderHashes(manifest.agreements[o.agreementHash!]) ?? [])
                .every((p) => settled.has(p)),
        );
        if (idx === -1) {
            throw new Error("Assembly topology is not a DAG — a sub-order's parents are unresolvable.");
        }
        const [next] = pending.splice(idx, 1);
        settled.add(next.id);
        ordered.push(next);
    }
    const cursor = new Map<string, number>();
    return ordered.map((node) => {
        const agreement = manifest.agreements[node.agreementHash!];
        const nodeClauses = (agreement?.sections ?? []).map((s) => s.clause);
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
 * The lead's OWN nodes are priced from the assembly the lead authored (the
 * manifest figure). A contributor's node is priced LIVE from the contributor's
 * own catalogue — the rate negotiated with the lead if one exists, else the
 * public price — the same `resolveCatalogueItemPrice` path the delivery leg
 * uses, minus the picker. Falls back to the manifest figure only if the
 * contributor publishes no component item.
 *
 * Returns a bigint: the manifest stores payments as decimal-wei strings (JSON
 * has no bigint), so a bare `cumulative += node.payment` would string-concat
 * (bigint + string), corrupting the cumulative. Coercion happens here.
 */
export function resolveSubOrderPayment(args: {
    node: AssemblyDocumentOrder;
    seller: `0x${string}`;
    leadAddress: `0x${string}`;
    sellerCatalogues: SellerCatalogue[];
    tokenDecimals: number;
}): bigint {
    const { node, seller, leadAddress, sellerCatalogues, tokenDecimals } = args;
    if (hexEqual(seller, leadAddress)) return BigInt(node.payment ?? 0n);
    const catalogue = sellerCatalogues.find((c) => hexEqual(c.address, seller));
    const item = catalogue?.menu.find((i) => i.category === "component");
    if (!item) return BigInt(node.payment ?? 0n);
    return parseToken(resolveCatalogueItemPrice(item, leadAddress).price, tokenDecimals);
}
