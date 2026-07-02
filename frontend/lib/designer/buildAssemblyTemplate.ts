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

import { keccak256, toHex } from "viem";
import type { Order } from "@/lib/kernel/store";
import { clauseIsStructural, getClauseSpec, listKnownClauseIds } from "@/lib/shared/clauseSpecSource";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import type { ClauseFields } from "@/lib/shared/clauseFields";

/** Fold the MANDATORY structural clauses into an order's clause set. Each
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
 *  clause selection. The MANDATORY structural clauses (commerce + topology) fold
 *  in automatically on every order — they are not designer choices. */
export function buildAssemblyTemplate(args: {
    name?: string;
    summary?: string;
    description?: string;
    orders: readonly Order[];
    clausesByOrderId: Readonly<Record<string, ClauseFields>>;
}): AssemblyTemplate {
    const { name, summary, description, orders, clausesByOrderId } = args;
    const structuralIds = listKnownClauseIds().filter(clauseIsStructural);
    if (structuralIds.length === 0) {
        // Without the chain→IPFS spec cache the structural clauses cannot be
        // resolved — refuse loudly rather than emit a template missing them.
        // Designer surfaces gate on `useClauseSpecs().loaded`.
        throw new Error(
            "clause specs not loaded: no structural clauses in the cache — gate the surface on useClauseSpecs().loaded (or prime the spec cache in tests) before building templates",
        );
    }
    // Re-label each design-time (synthetic) order id to a clean local label.
    // The template carries no chain ids and no party addresses — only the
    // clauses (the structural ones among them), keyed by these local labels.
    const idToLocal = new Map(orders.map((o, i) => [o.id, `order-${i}`]));
    return {
        ...(name ? { name } : {}),
        ...(summary ? { summary } : {}),
        ...(description ? { description } : {}),
        orders: orders.map((order, i) => ({
            id: `order-${i}`,
            clauses: {
                ...(clausesByOrderId[order.id] ?? {}),
                ...composeStructuralClauses(
                    structuralIds,
                    (order.parentOrderHashes ?? []).map((p) => idToLocal.get(p) ?? p),
                ),
            },
        })),
    };
}

/** Stable JSON serialization — sorted object keys at every depth — and the
 *  keccak256 content hash anchored on-chain. The template carries no bigints. */
function canonicalize(value: unknown): string {
    return JSON.stringify(value, (_key, raw) => {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(raw).sort()) sorted[k] = (raw as Record<string, unknown>)[k];
        return sorted;
    });
}

export function serializeAssemblyTemplate(template: AssemblyTemplate): {
    json: string;
    contentHash: `0x${string}`;
} {
    // The pinned document carries everything — INCLUDING the editorial
    // name/summary/description. But the content hash (→ slug + on-chain anchor)
    // derives from the COMPOSITION ONLY (the orders), so editorial edits never
    // fork identity: identical compositions collapse to one slug regardless of
    // their prose.
    const json = canonicalize(template);
    const composition = {
        orders: template.orders,
    };
    const contentHash = keccak256(toHex(canonicalize(composition)));
    return { json, contentHash };
}
