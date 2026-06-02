/**
 * assemblyDocumentToDraft — hydrates a `DesignSnapshot` from a published
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

import { saveAgreement } from "@/lib/core/agreementStore";
import { buildOrderAgreement } from "@/lib/core/orderAgreement";
import { computeAgreementHash } from "@/lib/core/agreement";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { AssemblyTemplate } from "./assemblyTemplate";
import type { ClauseFields } from "@/lib/core/encoding";
import type { DesignSnapshot } from "./syntheticDesignStore";
import { Order, OrderState } from "@/lib/core/store";
import { syntheticAddress } from "./syntheticProcess";

/** 1.0 — display-only payment; the template itself carries none. */
const DISPLAY_PAYMENT = 1_000_000_000_000_000_000n;
const SYNTHETIC_PROCESS_ID = `0x${"00".repeat(32)}`;

/**
 * Reconstruct displayable orders from a template: each template order → a
 * synthetic agreement (from its clauses + DAG parents) seeded into the store
 * so the canvas resolves it by hash. Used by the fork path and the read-only
 * `/view` resolver.
 */
export function templateToOrders(template: AssemblyTemplate): Order[] {
    return template.orders.map((to, i) => {
        // The template is party-agnostic. For DISPLAY (fork / read-only /view)
        // we reconstruct synthetic parties — one shared synthetic buyer
        // (rootBuyer) + a distinct synthetic seller per order. Real parties bind
        // at adoption/checkout, never from the template.
        const buyer = syntheticAddress(0);
        const seller = syntheticAddress(i + 1);
        const agreement = buildOrderAgreement({
            buyer,
            seller,
            currency: ZERO_ADDRESS,
            payment: DISPLAY_PAYMENT,
            clauseFields: to.clauses as ClauseFields,
            parentOrderHashes: to.parentOrderIds,
        });
        const agreementHash = computeAgreementHash(agreement);
        saveAgreement(agreement);
        const cumulativeValue = DISPLAY_PAYMENT * BigInt(i + 1);
        return {
            id: to.id,
            processId: SYNTHETIC_PROCESS_ID,
            buyer,
            seller,
            currency: ZERO_ADDRESS,
            agreementHash,
            cumulativeValue,
            payment: DISPLAY_PAYMENT,
            state: OrderState.Active,
            sellerBond: cumulativeValue * 2n,
            buyerBond: DISPLAY_PAYMENT * 2n,
            salt: BigInt(i + 1),
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
        };
    });
}

export function assemblyDocumentToDraft(
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
