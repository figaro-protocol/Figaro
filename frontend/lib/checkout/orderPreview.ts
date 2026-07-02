/**
 * orderPreview.ts — the BUYER's preview, before signing.
 *
 * Turns a localStorage draft into the order the buyer is about to sign: it
 * builds the agreement and its merkle root LOCALLY and assembles the UNSIGNED
 * commitment (chain-time deadline + salt). It is NOT final, so it is NOT pinned
 * to IPFS — pinning happens only once the order is signed (orderSignedAndShared).
 *
 * This file also owns the pre-sign CONFIRM GATE: the singleton that pauses
 * signing until the human has seen the human-readable terms next to the 32-byte
 * agreementHash the wallet will show. The gate is SHARED — the buyer's preview
 * here and the seller's preview (orderPendingSellerSignature) are the same gate
 * over different term sources.
 */
import {
    generateSalt,
    computeDeadline,
    type Agreement,
    type Commitment,
    type Hex,
} from "@figaro/core";
import { publicClient } from "@/lib/shared/wagmi";
import { ZERO_PROCESS_ID } from "@/lib/shared/evm";
import { buildOrderAgreement } from "@/lib/core/orderAgreement";
import type { DraftOrder } from "@/lib/checkout/draftOrders";

// ── Build the buyer's preview from a draft ──────────────────────────────────

export interface OrderPreview {
    agreement: Agreement;
    agreementHash: Hex;
    /** The unsigned commitment the buyer is about to sign. */
    commitment: Commitment;
}

/**
 * Commitment deadline from CHAIN time. `block.timestamp` is the clock the kernel
 * checks (FigaroCore's DeadlineExpired guard); a wall-clock deadline silently
 * expires whenever the device clock and the chain disagree (a skewed device on
 * mainnet; a time-traveled devnet). Falls back to wall-clock only if the chain
 * read fails.
 */
async function chainDeadline(ttlSeconds = 3600n): Promise<bigint> {
    try {
        const block = await publicClient.getBlock({ blockTag: "latest" });
        return block.timestamp + ttlSeconds;
    } catch {
        return computeDeadline();
    }
}

/**
 * Build the buyer's preview from a draft. A root order leaves `processId` at 0x0
 * (the kernel derives it from the EIP-712 digest) and sets
 * expectedCumulativeValue = payment; a sub-order passes the live processId and
 * the running cumulative value.
 */
export async function buildOrderPreview(
    draft: DraftOrder,
    opts?: { processId?: Hex; expectedCumulativeValue?: bigint },
): Promise<OrderPreview> {
    const { agreement, agreementHash } = buildOrderAgreement(
        draft.buyer,
        draft.seller,
        draft.clauses,
    );
    const commitment: Commitment = {
        processId: opts?.processId ?? ZERO_PROCESS_ID,
        buyer: draft.buyer,
        seller: draft.seller,
        currency: draft.currency,
        payment: draft.payment,
        expectedCumulativeValue: opts?.expectedCumulativeValue ?? draft.payment,
        agreementHash,
        salt: generateSalt(),
        deadline: await chainDeadline(),
    };
    return { agreement, agreementHash, commitment };
}

// ── Pre-sign confirm gate (shared with the seller's preview) ────────────────
//
// Threat-model 🟡 (UI ↔ wallet). The wallet prompt for an EIP-712 Commitment
// shows only the agreementHash (a 32-byte merkle root). The signer cannot verify
// in the wallet that the hash matches the terms they assembled. This store + its
// Provider + Modal close the gap: every sign goes through `requestSignConfirmation`,
// which posts a pending preview; the Provider renders the human-readable terms
// next to the hash; the user confirms or cancels; only then does the wallet open.
// Singleton + global Provider avoids placing a modal at every call site.

export interface PendingPreview {
    id: number;
    commitment: Commitment;
    /** May be null when the agreement isn't recoverable; the modal still shows
     *  the commitment fields and the hash, and should warn when it's missing. */
    agreement: Agreement | null;
}

type Subscriber = (pending: PendingPreview | null) => void;

let nextId = 1;
let current: PendingPreview | null = null;
let resolveCurrent: ((approved: boolean) => void) | null = null;
const subscribers = new Set<Subscriber>();
let testMode: "auto-approve" | "auto-reject" | null = null;

function emit(): void {
    for (const s of subscribers) s(current);
}

/**
 * Request confirmation before signing. Resolves `true` on Confirm, `false` on
 * Cancel. The Provider must be mounted; otherwise the promise pends forever.
 */
export function requestSignConfirmation(
    commitment: Commitment,
    agreement: Agreement | null,
): Promise<boolean> {
    if (testMode === "auto-approve") return Promise.resolve(true);
    if (testMode === "auto-reject") return Promise.resolve(false);
    if (current !== null) return Promise.resolve(false); // concurrent — reject the new one
    return new Promise<boolean>((resolve) => {
        current = { id: nextId++, commitment, agreement };
        resolveCurrent = (approved) => {
            current = null;
            resolveCurrent = null;
            emit();
            resolve(approved);
        };
        emit();
    });
}

/** Provider calls this on Confirm. */
export function confirmPendingSign(): void {
    resolveCurrent?.(true);
}

/** Provider calls this on Cancel / dismiss. */
export function cancelPendingSign(): void {
    resolveCurrent?.(false);
}

/** Provider subscribes for `current` updates; returns an unsubscribe fn. */
export function subscribeToPendingSign(fn: Subscriber): () => void {
    subscribers.add(fn);
    fn(current);
    return () => {
        subscribers.delete(fn);
    };
}

/** Test-only: reset the singleton to a clean state. */
export function _resetSignPreviewStore_TESTING_ONLY(): void {
    if (resolveCurrent) resolveCurrent(false);
    current = null;
    resolveCurrent = null;
    subscribers.clear();
    nextId = 1;
    testMode = null;
}

/** Test-only: skip the modal and resolve immediately (set in the vitest setup). */
export function _setSignPreviewMode_TESTING_ONLY(
    mode: "auto-approve" | "auto-reject" | null,
): void {
    testMode = mode;
}
