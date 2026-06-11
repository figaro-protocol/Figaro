/**
 * assemblyTemplateToDraft — hydrates a `DesignSnapshot` from a published
 * assembly TEMPLATE (the no-hash JSON pinned on AssemblyRegistry). Powers the
 * "Fork" button: a published template is fetched, this helper turns it into a
 * localStorage draft under a new slug, and the canvas opens at
 * /builders/designer/edit/<new-slug>.
 *
 * The template carries structure (orders + DAG parents) + the per-order clause
 * choices, but no agreements and no payment (payment is a runtime value). So
 * each template order is reconstructed into a display Order with a synthetic
 * agreement (built from its clauses + DAG parents) seeded into the store so the
 * canvas resolves it by hash; the clause choices are carried into the draft's
 * `clausesByOrderId` so re-opening the fork shows them.
 */

import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { templateParentOrderIds, type AssemblyTemplate } from "./assemblyTemplate";
import type { ClauseFields } from "@/lib/core/encoding";
import type { DesignSnapshot } from "./syntheticDesignStore";
import { Order } from "@/lib/core/store";
import { buildSyntheticOrder, syntheticAddress } from "./syntheticProcess";

/** 1.0 — display-only payment; the template itself carries none. */
const DISPLAY_PAYMENT = 1_000_000_000_000_000_000n;
const SYNTHETIC_PROCESS_ID = `0x${"00".repeat(32)}` as `0x${string}`;

/**
 * Reconstruct displayable orders from a template: each template order → a
 * synthetic agreement (from its clauses + DAG parents) seeded into the store
 * so the canvas resolves it by hash. Used by the fork path and the read-only
 * `/view` resolver.
 */
export function templateToOrders(template: AssemblyTemplate): Order[] {
    // The template is party-agnostic. For DISPLAY (fork / read-only /view) we
    // reconstruct synthetic parties — one shared synthetic buyer (rootBuyer) +
    // a distinct synthetic seller per order. Real parties bind at
    // adoption/checkout, never from the template. Per-order build→hash→save→
    // assemble is the shared `buildSyntheticOrder`.
    return template.orders.map((to, i) =>
        buildSyntheticOrder({
            orderId: to.id as `0x${string}`,
            processId: SYNTHETIC_PROCESS_ID,
            buyer: syntheticAddress(0),
            seller: syntheticAddress(i + 1),
            currency: ZERO_ADDRESS,
            payment: DISPLAY_PAYMENT,
            cumulativeValue: DISPLAY_PAYMENT * BigInt(i + 1),
            salt: BigInt(i + 1),
            clauseFields: to.clauses as ClauseFields,
            parentOrderHashes: templateParentOrderIds(to),
        }).order,
    );
}

export function assemblyTemplateToDraft(
    template: AssemblyTemplate,
    options: { slug: string; name?: string },
): DesignSnapshot {
    const orders = templateToOrders(template);
    return {
        slug: options.slug,
        name: options.name ?? `Fork of ${template.name}`,
        processId: SYNTHETIC_PROCESS_ID,
        nextOrderIndex: orders.length,
        nextSellerIndex: orders.length + 1,
        orders,
        clausesByOrderId: Object.fromEntries(
            template.orders.map((to) => [to.id, to.clauses]),
        ),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}
