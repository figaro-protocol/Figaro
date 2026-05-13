/**
 * agreementHints — three booleans the `AgreementDrawer` needs about the
 * currently-selected order to render context-sensitive hint copy.
 *
 *   - hasChildren            : has at least one descendant in the DAG.
 *   - parentDeliveryActive   : any parent's fulfilment includes "delivery".
 *   - hasCourierChild        : at least one child carries roleHint="courier".
 *
 * Used by both the editor (DesignerCanvas) and the read-only review/inspect
 * view (ViewAssemblyClient). Lifting them to a shared helper avoids
 * three-fold IIFE duplication AND collapses three redundant
 * `deriveOrderTopology` calls per render into one.
 */

import type { Order } from "@/lib/core/store";
import { deriveOrderTopology } from "@/lib/core/orderTopology";
import { summarizeAgreement } from "@/lib/core/orderAgreement";
import { loadAgreement } from "@/lib/core/agreementStore";
import { readAgreementFields } from "@/lib/designer/syntheticProcess";

export interface AgreementHints {
    hasChildren: boolean;
    parentDeliveryActive: boolean;
    hasCourierChild: boolean;
}

const EMPTY: AgreementHints = {
    hasChildren: false,
    parentDeliveryActive: false,
    hasCourierChild: false,
};

export function computeAgreementHints(
    orders: Order[],
    selectedOrderId: string | null,
): AgreementHints {
    if (!selectedOrderId) return EMPTY;
    const topology = deriveOrderTopology(orders);

    let hasChildren = false;
    let hasCourierChild = false;
    for (const order of orders) {
        const info = topology.get(order.id);
        if (!info?.parentOrderIds.includes(selectedOrderId)) continue;
        hasChildren = true;
        const childFields = readAgreementFields(order);
        if (childFields.roleHint === "courier") {
            hasCourierChild = true;
            break;
        }
    }

    let parentDeliveryActive = false;
    const info = topology.get(selectedOrderId);
    if (info && info.parentOrderIds.length > 0) {
        for (const parentId of info.parentOrderIds) {
            const parent = orders.find((o) => o.id === parentId);
            if (!parent) continue;
            const summary = summarizeAgreement(loadAgreement(parent.agreementHash));
            if (summary?.fulfilment?.modalities?.includes("delivery")) {
                parentDeliveryActive = true;
                break;
            }
        }
    }

    return { hasChildren, parentDeliveryActive, hasCourierChild };
}
