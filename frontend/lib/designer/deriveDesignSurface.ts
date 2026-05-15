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
 * Role kinds the design surfaces. Always includes `"buyer"` (every
 * process has a root buyer). For each order, applies structural
 * inference from the agreement's anchored sections:
 *
 *   - Root order (topology section missing or parents empty) → "merchant"
 *   - Sub-order with `figaro-courier-process-v1` anchored    → "courier"
 *   - Sub-order with `figaro-offset-policy-v1` anchored      → "offset"
 *   - Otherwise (sub-order)                                  → "co-seller"
 *
 * The signal is the schema list on the agreement; matches the drawer's
 * per-role booleans.
 *
 * Deduped and sorted alphabetically.
 */
export function getRoleKindsForDesign(orders: readonly Order[]): string[] {
    const kinds = new Set<string>(["buyer"]);
    for (const order of orders) {
        if (!order.agreementHash) continue;
        const agreement = loadAgreement(order.agreementHash);
        if (!agreement) continue;
        const schemaIds = new Set(agreement.sections.map((s) => s.schema));

        const topologySection = agreement.sections.find((s) => s.schema === TOPOLOGY_SCHEMA);
        const parentHashes = (topologySection?.data as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes;
        const isRoot = !Array.isArray(parentHashes) || parentHashes.length === 0;

        if (isRoot) {
            kinds.add("merchant");
        } else if (schemaIds.has(COURIER_PROCESS_SCHEMA)) {
            kinds.add("courier");
        } else if (schemaIds.has(OFFSET_POLICY_SCHEMA)) {
            kinds.add("offset");
        } else {
            kinds.add("co-seller");
        }
    }
    return Array.from(kinds).sort();
}
