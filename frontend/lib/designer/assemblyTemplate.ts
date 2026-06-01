/**
 * Assembly template — the no-hash JSON the designer emits.
 *
 * Per order it carries who is bound (buyer / seller), the order's place in the
 * DAG (`parentOrderIds` — the order in which the process unfurls), and the
 * clauses selected on it (the buyer↔seller relationship). It carries NO
 * agreement hashes, NO clause field values, NO sentinels: the fingerprint
 * forms later, at checkout, when the parties fill the clause fields.
 *
 * `parentOrderIds` is read from each order's existing topology section; clause
 * selection comes from the designer's per-order pick (the Registry checkboxes).
 */

import { keccak256, toHex } from "viem";
import type { Order } from "@/lib/core/store";
import { loadAgreement } from "@/lib/core/agreementStore";
import { summarizeAgreement } from "@/lib/core/orderAgreement";

/** A clause on an order → the field values filled at design time. An empty
 *  object means the clause is selected but the designer set no fields (the
 *  rest is filled downstream — seller at first-use, buyer at checkout). */
export type ClauseValues = Record<string, Record<string, unknown>>;

export interface AssemblyTemplateOrder {
    /** Synthetic order id — stable within the design. */
    id: string;
    buyer: string;
    seller: string;
    /** Parent order ids — the DAG edges defining unfurl order. Root = []. */
    parentOrderIds: string[];
    /** clauseId → the design-time field values the designer filled (the
     *  buyer↔seller relationship). Whatever's absent is filled downstream. */
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

/** Read an order's parent ids from its topology section, or [] if none. */
function parentOrderIdsOf(order: Order): string[] {
    if (!order.agreementHash) return [];
    const parents = summarizeAgreement(loadAgreement(order.agreementHash))?.topology
        ?.parentOrderHashes;
    return parents ? [...parents] : [];
}

/** Build the no-hash assembly template from the design's orders + the
 *  per-order clause selection. */
export function buildAssemblyTemplate(args: {
    slug: string;
    name: string;
    privilegedToken?: string;
    orders: readonly Order[];
    clausesByOrderId: Readonly<Record<string, ClauseValues>>;
}): AssemblyTemplate {
    const { slug, name, privilegedToken, orders, clausesByOrderId } = args;
    return {
        slug,
        name,
        ...(privilegedToken ? { privilegedToken } : {}),
        orders: orders.map((order) => ({
            id: order.id,
            buyer: order.buyer,
            seller: order.seller,
            parentOrderIds: parentOrderIdsOf(order),
            clauses: { ...(clausesByOrderId[order.id] ?? {}) },
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
