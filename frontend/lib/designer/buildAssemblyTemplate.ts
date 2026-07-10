/**
 * lib/designer/buildAssemblyTemplate.ts — AUTHORING the assembly template.
 *
 * Designer-tier only: composing a design snapshot into the no-hash template
 * JSON and serializing it for pinning/anchoring. The template TYPES, the
 * topology-edge accessor, and the slug derivation are READING vocabulary and
 * live in `@/lib/shared/assemblyTemplate` — every non-designer surface
 * imports from there, never from here (design is design; checkout is
 * checkout).
 */

import { canonicalize } from "@/lib/shared/canonicalJson";
import type { Order } from "@/lib/kernel/store";
import { clauseIsStructural, getClauseSpec, listKnownClauseIds } from "@/lib/shared/clauseSpecSource";
import { templateCompositionHash, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import type { ClauseFields } from "@/lib/shared/clauseFields";

/** Fold the MANDATORY structural clauses into a template agreement's clause
 *  set. Each
 *  structural clause (`block.article: "structural"`) draws the fields it declares
 *  from the design-time value bag — topology gets `{ parentOrderHashes }` (mode
 *  is DERIVED from the edges, never stored); commerce's currency/payment/lineItems are NOT design-time
 *  (the buyer fills them at checkout), so commerce folds in empty. Generic: a
 *  never-seen structural clause composes the subset of the bag it declares, with
 *  zero per-clause code. */
function composeStructuralClauses(structuralIds: readonly string[], parents: string[]): ClauseFields {
    // The design-time structural value bag. Checkout-time values (commerce's
    // currency/payment/lineItems) are deliberately absent — filled downstream.
    const bag: Record<string, unknown> = {
        parentOrderHashes: parents,
    };
    const out: ClauseFields = {};
    for (const id of structuralIds) {
        const data: Record<string, unknown> = {};
        for (const field of getClauseSpec(id)?.fields ?? []) {
            if (field.name in bag) data[field.name] = bag[field.name];
        }
        out[id] = data;
    }
    return out;
}

/** Build the no-hash assembly template from the design's orders + the per-order
 *  clause selection: one template AGREEMENT per canvas order. The MANDATORY
 *  structural clauses (commerce + topology) fold in automatically on every
 *  agreement — they are not designer choices. */
export function buildAssemblyTemplate(args: {
    name?: string;
    summary?: string;
    description?: string;
    orders: readonly Order[];
    clausesByOrderId: Readonly<Record<string, ClauseFields>>;
    /** orderId → clauseId → the registered version the designer composed.
     *  Optional; absent entries mean version 1. */
    clauseVersionsByOrderId?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}): AssemblyTemplate {
    const { name, summary, description, orders, clausesByOrderId, clauseVersionsByOrderId } = args;
    // NOT point-free: the predicate takes (clauseId, version?) and Array.filter
    // would pass the element INDEX as the version — an exact-version miss for
    // every clause (the version-axis e2e caught exactly this).
    const structuralIds = listKnownClauseIds().filter((id) => clauseIsStructural(id));
    if (structuralIds.length === 0) {
        // Without the chain→IPFS spec cache the structural clauses cannot be
        // resolved — refuse loudly rather than emit a template missing them.
        // Designer surfaces gate on `useClauseSpecs().loaded`.
        throw new Error(
            "clause specs not loaded: no structural clauses in the cache — gate the surface on useClauseSpecs().loaded (or prime the spec cache in tests) before building templates",
        );
    }
    // Re-label each design-time (synthetic) order id to a clean local label
    // naming the future kernel-order slot. The template carries no chain ids
    // and no party addresses — only the clauses (the structural ones among
    // them), keyed by these local labels.
    const idToLocal = new Map(orders.map((o, i) => [o.orderHash, `order-${i}`]));
    return {
        ...(name ? { name } : {}),
        ...(summary ? { summary } : {}),
        ...(description ? { description } : {}),
        agreements: orders.map((order, i) => {
            const clauses = {
                ...(clausesByOrderId[order.orderHash] ?? {}),
                ...composeStructuralClauses(
                    structuralIds,
                    (order.parentOrderHashes ?? []).map((p) => idToLocal.get(p) ?? p),
                ),
            };
            // Record each composed clause's registered version — the designer's
            // pick for selected clauses, the loaded spec's version for the
            // auto-folded structural ones. NORMALIZED SPARSE: v1 entries are
            // dropped and an empty map is omitted, so templates composed
            // entirely from v1 clauses hash identically to the pre-version form.
            const versions: Record<string, number> = {};
            for (const clauseId of Object.keys(clauses)) {
                const v = clauseVersionsByOrderId?.[order.orderHash]?.[clauseId]
                    ?? getClauseSpec(clauseId)?.version
                    ?? 1;
                if (v !== 1) versions[clauseId] = v;
            }
            return {
                id: `order-${i}`,
                clauses,
                ...(Object.keys(versions).length > 0 ? { clauseVersions: versions } : {}),
            };
        }),
    };
}

export function serializeAssemblyTemplate(template: AssemblyTemplate): {
    json: string;
    compositionHash: `0x${string}`;
} {
    // The pinned document carries everything — INCLUDING the editorial
    // name/summary/description. But the composition hash (→ slug + on-chain
    // anchor) derives from the COMPOSITION ONLY, so editorial edits never
    // fork identity: identical compositions collapse to one binding regardless
    // of their prose.
    const json = canonicalize(template);
    const compositionHash = templateCompositionHash(template);
    return { json, compositionHash };
}
