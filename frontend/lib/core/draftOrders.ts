/**
 * draftOrders.ts — the user's DRAFT orders, held in localStorage.
 *
 * A draft is an order the buyer is still composing: a seller, the payment, and
 * the filled clause values for the seller's pinned assembly. It is NOT final.
 *
 * It carries NO `agreementHash` and NO signature — those exist only AFTER the
 * buyer finalizes (builds the agreement and hashes it) and signs. Once an order
 * is signed, shared with the seller, or broadcast, it does NOT live here.
 *
 * Drafts are the user's alone (this browser's localStorage); the caller supplies
 * the draft id used as the key.
 */
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

const STORE_PREFIX = "figaro:draft-order:";

export interface DraftOrder {
    buyer: `0x${string}`;
    seller: `0x${string}`;
    currency: `0x${string}`;
    payment: bigint;
    /** The filled clause values for the seller's pinned assembly. */
    clauses: ClauseFields;
    /** Topology position, when composing a sub-order. Optional. */
    parentOrderHashes?: string[];
}

/** Serializable form (bigint payment → string). */
interface StoredDraftOrder {
    buyer: string;
    seller: string;
    currency: string;
    payment: string;
    clauses: ClauseFields;
    parentOrderHashes?: string[];
}

function toStored(d: DraftOrder): StoredDraftOrder {
    return {
        buyer: d.buyer,
        seller: d.seller,
        currency: d.currency,
        payment: d.payment.toString(),
        clauses: d.clauses,
        ...(d.parentOrderHashes ? { parentOrderHashes: d.parentOrderHashes } : {}),
    };
}

function fromStored(s: StoredDraftOrder): DraftOrder {
    return {
        buyer: s.buyer as `0x${string}`,
        seller: s.seller as `0x${string}`,
        currency: s.currency as `0x${string}`,
        payment: BigInt(s.payment),
        clauses: s.clauses,
        ...(s.parentOrderHashes ? { parentOrderHashes: s.parentOrderHashes } : {}),
    };
}

// The draft-order localStorage API is a runtime DELIVERABLE ahead of its UI: the
// buyer's order-composition surface (draft → preview → sign) is not yet wired, so
// these have no consumer — they ship with the order* path by design. @public on
// each keeps knip green until that surface lands (see the punch-list draft-order
// testing item).

/** @public — Save (or replace) a draft order under `draftId`. */
export function saveDraftOrder(draftId: string, draft: DraftOrder): void {
    writeJsonStorage(STORE_PREFIX + draftId, toStored(draft));
}

/** @public — Load a draft order by id. Returns null if none is held. */
export function loadDraftOrder(draftId: string): DraftOrder | null {
    const stored = readJsonStorage<StoredDraftOrder | null>(STORE_PREFIX + draftId, null);
    if (!stored) return null;
    try {
        return fromStored(stored);
    } catch {
        return null;
    }
}

/** @public — The ids of every draft order currently held. */
export function listDraftOrders(): string[] {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORE_PREFIX)) ids.push(key.slice(STORE_PREFIX.length));
    }
    return ids;
}

/** @public — Drop a draft (e.g. once it has been finalized + shared). */
export function deleteDraftOrder(draftId: string): void {
    localStorage.removeItem(STORE_PREFIX + draftId);
}
