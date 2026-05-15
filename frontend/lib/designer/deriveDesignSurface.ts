/**
 * deriveDesignSurface — pure helpers that summarize what mechanism kinds
 * and role kinds the current canvas state implies. Powers the Prose sheet
 * (so the user can rename derived mechanisms / roles) and is the
 * foundation for the future canvas → assembly derivation function.
 *
 * Both helpers run against the same data the runtime would: each order's
 * agreement (loaded via `loadAgreement` by agreementHash). Role derivation
 * is structural — it reads the schema list anchored on each order's
 * agreement, not any UI-only marker.
 */

import type { Order } from "@/lib/core/store";
import { loadAgreement } from "@/lib/core/agreementStore";
import { getSchemaSpec } from "@/lib/shared/schemaSpecSource";

const COURIER_PROCESS_SCHEMA = "figaro-courier-process-v1";
const OFFSET_POLICY_SCHEMA = "figaro-offset-policy-v1";
const TOPOLOGY_SCHEMA = "figaro-topology-v1";

/**
 * Mechanism kinds the design references, via each schema spec's `block`
 * binding for every schema clause anchored in any order's agreement.
 * Deduped and sorted alphabetically for stable display order.
 */
export function getMechanismKindsForDesign(orders: readonly Order[]): string[] {
    const kinds = new Set<string>();
    for (const order of orders) {
        if (!order.agreementHash) continue;
        const agreement = loadAgreement(order.agreementHash);
        if (!agreement) continue;
        for (const section of agreement.sections) {
            const block = getSchemaSpec(section.schema)?.block;
            if (!block) continue;
            for (const kind of block.mechanismKinds) kinds.add(kind);
        }
    }
    return Array.from(kinds).sort();
}

/**
 * Role kinds the design surfaces. Always includes `"buyer"` and
 * `"seller"` (the kernel's two roles). Additional labels are emitted
 * only when an order anchors an on-chain process-schema whose name
 * is locked in the SchemaRegistry — those are schema identifiers, not
 * roles in the kernel sense, but the designer surface uses them to
 * label sub-orders whose attestation surface differs from a generic
 * seller's.
 *
 *   - Sub-order anchors `figaro-courier-process-v1` → "courier"
 *
 * Deduped and sorted alphabetically.
 */
export function getRoleKindsForDesign(orders: readonly Order[]): string[] {
    const kinds = new Set<string>(["buyer", "seller"]);
    for (const order of orders) {
        if (!order.agreementHash) continue;
        const agreement = loadAgreement(order.agreementHash);
        if (!agreement) continue;
        const schemaIds = new Set(agreement.sections.map((s) => s.schema));

        if (schemaIds.has(COURIER_PROCESS_SCHEMA)) {
            kinds.add("courier");
        }
    }
    return Array.from(kinds).sort();
}
