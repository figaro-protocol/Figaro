/**
 * orderPreview.ts — the BUYER's preview, before signing.
 *
 * Turns a localStorage draft into the order the buyer is about to sign: it
 * builds the agreement and its merkle root LOCALLY and assembles the UNSIGNED
 * commitment (chain-time deadline + salt). It is NOT final, so it is NOT pinned
 * to IPFS — pinning happens only once the order is signed (orderSignedAndShared).
 *
 * This file also owns the CONFIRM GATE: the singleton that pauses signing —
 * and the standalone commit broadcast — until the human has seen the
 * human-readable terms next to the 32-byte agreementHash they bind to. The
 * gate is SHARED — the buyer's preview here, the seller's preview
 * (orderPendingSellerSignature), and the both-sigs broadcast are the same
 * gate over different term sources.
 */
import {
    computeDeadline,
    type Agreement,
    type Commitment,
    type Hex,
} from "@figaro/sdk";
import { publicClient } from "@/lib/shared/wagmi";

// ── The buyer's preview (what the confirm gate + sign flow consume) ─────────
// Built by the checkout walk (`assemblyCheckout` drives the SDK's
// reconstructOrdersFromTemplate and shapes each realized order into this).

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
 * mainnet; a time-traveled devnet). NO wall-clock fallback (maintainer rule
 * 2026-08-06): if the chain can't be read, the order can't be built either —
 * fail loudly here rather than sign a deadline the kernel may judge by a
 * different clock.
 */
export async function chainDeadline(ttlSeconds = 3600n): Promise<bigint> {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    return block.timestamp + ttlSeconds;
}

// ── Confirm gate (shared: sign AND commit, both parties) ────────────────────
//
// Threat-model 🟡 (UI ↔ wallet). The wallet prompt for an EIP-712 Commitment
// shows only the agreementHash (a 32-byte merkle root); the prompt for the
// commit broadcast shows an opaque transaction. Neither lets the party verify
// the terms they're binding to. This store + its Provider + Modal close the
// gap: every sign goes through `requestSignConfirmation` and every standalone
// broadcast through `requestCommitConfirmation`; each posts a pending preview;
// the Provider renders the human-readable terms next to the hash; the user
// confirms or cancels; only then does the wallet open.
// Singleton + global Provider avoids placing a modal at every call site.

/** Which wallet act the confirmation gates — the modal words itself by this. */
export type ConfirmationIntent = "sign" | "commit";

/** A swap-funded bond leg the party is about to witness-sign, surfaced in the
 *  SAME confirm as the agreement so `maxInput` (the Permit2 cap they authorize)
 *  is reviewed on the Figaro side, not only in the wallet's native prompt. */
export interface SwapConfirmationDetails {
    inputToken: string;
    currency: string;
    /** The maximum input the swap may consume — the figure being authorized. */
    maxInput: bigint;
}

export interface PendingPreview {
    id: number;
    intent: ConfirmationIntent;
    commitment: Commitment;
    /** May be null when the agreement isn't recoverable; the modal still shows
     *  the commitment fields and the hash, and should warn when it's missing. */
    agreement: Agreement | null;
    /** Present when this order's bond is swap-funded — the modal shows the swap
     *  leg alongside the agreement so one confirm covers both signatures. */
    swap?: SwapConfirmationDetails | null;
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

function requestConfirmation(
    intent: ConfirmationIntent,
    commitment: Commitment,
    agreement: Agreement | null,
    swap: SwapConfirmationDetails | null = null,
): Promise<boolean> {
    if (testMode === "auto-approve") return Promise.resolve(true);
    if (testMode === "auto-reject") return Promise.resolve(false);
    if (current !== null) return Promise.resolve(false); // concurrent — reject the new one
    return new Promise<boolean>((resolve) => {
        current = { id: nextId++, intent, commitment, agreement, swap };
        resolveCurrent = (approved) => {
            current = null;
            resolveCurrent = null;
            emit();
            resolve(approved);
        };
        emit();
    });
}

/**
 * Request confirmation before signing. Resolves `true` on Confirm, `false` on
 * Cancel. The Provider must be mounted; otherwise the promise pends forever.
 * When the bond is swap-funded, pass `swap` so the modal surfaces the swap leg
 * (its `maxInput`) alongside the agreement — one confirm gates BOTH the
 * commitment sign and the Permit2 witness sign that follows.
 */
export function requestSignConfirmation(
    commitment: Commitment,
    agreement: Agreement | null,
    swap: SwapConfirmationDetails | null = null,
): Promise<boolean> {
    return requestConfirmation("sign", commitment, agreement, swap);
}

/**
 * Request confirmation before broadcasting an already fully-signed commitment
 * on-chain — the standalone COMMIT step, the moment both bonds lock. Same
 * gate, same modal, commit wording.
 */
export function requestCommitConfirmation(
    commitment: Commitment,
    agreement: Agreement | null,
): Promise<boolean> {
    return requestConfirmation("commit", commitment, agreement);
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
