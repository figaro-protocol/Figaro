/**
 * Assembly template — the no-hash JSON the designer emits.
 *
 * Per order it carries the clauses composed on it (the buyer↔seller
 * relationship's MEANING) — and the DAG is ONE OF THOSE CLAUSES: the
 * manifest-only topology clause holds the order's parent ids. The template
 * carries NO party addresses (PARTY-AGNOSTIC — parties bind at
 * adoption/checkout), NO agreement hashes, NO sentinels: the fingerprint
 * forms later, at checkout, when the real parties fill the clause fields.
 */

import { keccak256, toHex } from "viem";
import type { Order } from "@/lib/core/store";
import { manifestTopologyClauseId } from "@/lib/shared/clauseSpecSource";

/** A clause on an order → the field values filled at design time. An empty
 *  object means the clause is selected but the designer set no fields (the
 *  rest is filled downstream — seller at first-use, buyer at checkout). */
export type ClauseValues = Record<string, Record<string, unknown>>;

export interface AssemblyTemplateOrder {
    /** Local order label — `order-<index>`, stable within the template; the
     *  reference target the topology clause points at. NOT a chain id, and NOT
     *  a party — the template is party-agnostic. */
    id: string;
    /** clauseId → the design-time field values the designer composed. The DAG
     *  is a clause here too: the manifest-only topology clause carries
     *  `{ parentOrderIds }` (root = []). Whatever's absent is filled
     *  downstream. */
    clauses: ClauseValues;
}

export interface AssemblyTemplate {
    /** EDITORIAL — the designer's own words, for legibility (the content-derived
     *  slug is opaque at scale). `name` is a short handle, `summary` a one-line
     *  gloss, `description` the long form. Free-form prose, NOT a taxonomy
     *  (open-world: like a seller's name/specialty/description). These are pinned
     *  in the document but EXCLUDED from the content hash — identity stays
     *  composition-derived, so renaming never forks the slug. All optional. */
    name?: string;
    summary?: string;
    description?: string;
    /** ERC-20 the assembly privileges (its denomination / value-capture
     *  token). Absent = ERC-20-agnostic (any token, per the process at
     *  checkout). One token per assembly; offering several = several
     *  assemblies. The Core stays token-agnostic — this is an assembly-layer
     *  choice, not a kernel constraint. */
    privilegedToken?: string;
    orders: AssemblyTemplateOrder[];
}

/** Read a template order's parent ids — the data of its topology clause. The
 *  DAG is a clause like any other; this is the one accessor for it. The entry
 *  is found by its DATA KEY (`parentOrderIds`), so reading needs no spec
 *  cache and tolerates any registry-defined topology clause. */
export function templateParentOrderIds(order: AssemblyTemplateOrder): string[] {
    const entry = Object.values(order.clauses).find(
        (fields) => Array.isArray((fields as { parentOrderIds?: unknown } | undefined)?.parentOrderIds),
    );
    const ids = (entry as { parentOrderIds?: unknown } | undefined)?.parentOrderIds;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** Build the no-hash assembly template from the design's orders + the per-order
 *  clause selection. The DAG is folded in as the manifest-only topology clause
 *  — not a separate field. */
export function buildAssemblyTemplate(args: {
    name?: string;
    summary?: string;
    description?: string;
    privilegedToken?: string;
    orders: readonly Order[];
    clausesByOrderId: Readonly<Record<string, ClauseValues>>;
}): AssemblyTemplate {
    const { name, summary, description, privilegedToken, orders, clausesByOrderId } = args;
    const topologyClauseId = manifestTopologyClauseId();
    if (!topologyClauseId) {
        // Without the chain→IPFS spec cache the topology clause cannot be
        // resolved — refuse loudly rather than emit a template with no DAG.
        // Designer surfaces gate on `useClauseSpecs().loaded`.
        throw new Error(
            "clause specs not loaded: no manifest-only topology clause in the cache — gate the surface on useClauseSpecs().loaded (or prime the spec cache in tests) before building templates",
        );
    }
    // Re-label each design-time (synthetic) order id to a clean local label.
    // The template carries no chain ids and no party addresses — only the
    // clauses (topology among them), keyed by these local labels.
    const idToLocal = new Map(orders.map((o, i) => [o.id, `order-${i}`]));
    return {
        ...(name ? { name } : {}),
        ...(summary ? { summary } : {}),
        ...(description ? { description } : {}),
        ...(privilegedToken ? { privilegedToken } : {}),
        orders: orders.map((order, i) => ({
            id: `order-${i}`,
            clauses: {
                ...(clausesByOrderId[order.id] ?? {}),
                [topologyClauseId]: {
                    parentOrderIds: (order.parentOrderIds ?? []).map((p) => idToLocal.get(p) ?? p),
                },
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
    // derives from the COMPOSITION ONLY (privilegedToken + orders), so editorial
    // edits never fork identity: identical compositions collapse to one slug
    // regardless of their prose. This also keeps the hash byte-identical to what
    // scenarioSlugs.mjs computes (it has never carried editorial fields).
    const json = canonicalize(template);
    const composition = {
        ...(template.privilegedToken ? { privilegedToken: template.privilegedToken } : {}),
        orders: template.orders,
    };
    const contentHash = keccak256(toHex(canonicalize(composition)));
    return { json, contentHash };
}

/** The published slug — a deterministic id derived from the composition's
 *  content hash (the clauses + their values + the DAG). Identical compositions
 *  → identical slug (the registry's first-write-wins then dedups them); distinct
 *  compositions → distinct slug. There is no user-chosen name and no
 *  circularity: the slug is derived FROM the hash, never part of the hashed
 *  template. */
export function deriveAssemblySlug(contentHash: `0x${string}`): string {
    return `asm-${contentHash.slice(2, 18)}`;
}
