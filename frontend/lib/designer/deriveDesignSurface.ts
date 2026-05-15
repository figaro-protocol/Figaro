/**
 * deriveDesignSurface — pure helper that summarizes which mechanism
 * kinds the current canvas state implies. Powers the Prose sheet (so
 * the user can rename derived mechanisms) and is the foundation for the
 * future canvas → assembly derivation function.
 *
 * Runs against the same data the runtime would: each order's agreement
 * (loaded via `loadAgreement` by agreementHash).
 */

import type { Order } from "@/lib/core/store";
import { loadAgreement } from "@/lib/core/agreementStore";
import { getSchemaSpec } from "@/lib/shared/schemaSpecSource";

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
