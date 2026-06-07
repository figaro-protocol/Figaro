/**
 * Assembly template — the no-hash JSON the designer emits.
 *
 * Per order it carries the clauses composed on it (the buyer↔seller
 * relationship's MEANING) — and the DAG is ONE OF THOSE CLAUSES:
 * `figaro-topology-v1` holds the order's parent ids. The template carries NO
 * party addresses (PARTY-AGNOSTIC — parties bind at adoption/checkout), NO
 * agreement hashes, NO sentinels: the fingerprint forms later, at checkout,
 * when the real parties fill the clause fields.
 */

import { keccak256, toHex } from "viem";
import type { Order } from "@/lib/core/store";
import { TOPOLOGY_CLAUSE_KEY } from "@/lib/core/agreement";

/** A clause on an order → the field values filled at design time. An empty
 *  object means the clause is selected but the designer set no fields (the
 *  rest is filled downstream — seller at first-use, buyer at checkout). */
export type ClauseValues = Record<string, Record<string, unknown>>;

interface AssemblyTemplateOrder {
    /** Local order label — `order-<index>`, stable within the template; the
     *  reference target the topology clause points at. NOT a chain id, and NOT
     *  a party — the template is party-agnostic. */
    id: string;
    /** clauseId → the design-time field values the designer composed. The DAG
     *  is a clause here too: `figaro-topology-v1` carries `{ parentOrderIds }`
     *  (root = []). Whatever's absent is filled downstream. */
    clauses: ClauseValues;
}

export interface AssemblyTemplate {
    slug: string;
    name: string;
    /** ERC-20 the assembly privileges (its denomination / value-capture
     *  token). Absent = ERC-20-agnostic (any token, per the process at
     *  checkout). One token per assembly; offering several = several
     *  assemblies. The Core stays token-agnostic — this is an assembly-layer
     *  choice, not a kernel constraint. */
    privilegedToken?: string;
    orders: AssemblyTemplateOrder[];
}

/** Read a template order's parent ids — the data of its `figaro-topology-v1`
 *  clause. The DAG is a clause like any other; this is the one accessor for it. */
export function templateParentOrderIds(order: AssemblyTemplateOrder): string[] {
    const ids = order.clauses[TOPOLOGY_CLAUSE_KEY]?.parentOrderIds;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** Build the no-hash assembly template from the design's orders + the per-order
 *  clause selection. The DAG is folded in as the `figaro-topology-v1` clause —
 *  not a separate field. */
export function buildAssemblyTemplate(args: {
    slug: string;
    name: string;
    privilegedToken?: string;
    orders: readonly Order[];
    clausesByOrderId: Readonly<Record<string, ClauseValues>>;
}): AssemblyTemplate {
    const { slug, name, privilegedToken, orders, clausesByOrderId } = args;
    // Re-label each design-time (synthetic) order id to a clean local label.
    // The template carries no chain ids and no party addresses — only the
    // clauses (topology among them), keyed by these local labels.
    const idToLocal = new Map(orders.map((o, i) => [o.id, `order-${i}`]));
    return {
        slug,
        name,
        ...(privilegedToken ? { privilegedToken } : {}),
        orders: orders.map((order, i) => ({
            id: `order-${i}`,
            clauses: {
                ...(clausesByOrderId[order.id] ?? {}),
                [TOPOLOGY_CLAUSE_KEY]: {
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
    const json = canonicalize(template);
    return { json, contentHash: keccak256(toHex(json)) };
}
