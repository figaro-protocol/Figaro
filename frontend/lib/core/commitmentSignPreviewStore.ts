/**
 * commitmentSignPreviewStore — singleton queue for "user must confirm
 * the agreement terms before signing" pre-sign gate.
 *
 * Threat-model 🟡 Priority 4 (UI ↔ MetaMask). The wallet prompt for an
 * EIP-712 Commitment displays only the agreementHash (a 32-byte merkle
 * root). The user has no way to verify in the wallet that the hash matches
 * the agreement they assembled in the UI. This store + the corresponding
 * Provider + Modal close the gap: every `signCommitment` call goes through
 * `requestConfirmation`, which posts a pending preview onto the store; the
 * Provider renders an AgreementPreviewModal showing the human-readable
 * terms next to the hash; the user clicks Confirm or Cancel; the store
 * resolves or rejects the request; only then does the wallet prompt open.
 *
 * Architecture rationale:
 * - Singleton store + global Provider avoids per-consumer modal placement
 *   (would otherwise need a `<AgreementPreviewModal>` next to every
 *   `useCommitmentFlow` call site — currently 7 consumers).
 * - Promise-based API lets `signCommitment` `await` user confirmation as
 *   if it were any other async dependency. Cancel reject propagates as a
 *   thrown error — the existing error-handling path catches it.
 *
 * Concurrency: only one pending preview at a time. If a second
 * `requestConfirmation` fires before the first resolves, the second
 * rejects immediately. In practice the UI prevents concurrent signs;
 * this is a defensive belt-and-braces.
 */

import type { Commitment } from "@figaro/core";
import type { Agreement } from "@/lib/core/agreementManifest";

export interface PendingPreview {
    id: number;
    commitment: Commitment;
    /** May be null when the agreement isn't recoverable (older flows that
     *  haven't pre-loaded the agreement before sign). The modal still
     *  shows the commitment fields and the hash; consumers should warn
     *  the user when the agreement is missing. */
    agreement: Agreement | null;
}

type Subscriber = (pending: PendingPreview | null) => void;

let nextId = 1;
let current: PendingPreview | null = null;
let resolveCurrent: ((approved: boolean) => void) | null = null;
const subscribers = new Set<Subscriber>();

/**
 * Test-only override mode. When non-null, `requestSignConfirmation`
 * resolves immediately with the mapped boolean without waiting for a
 * Provider to mount or a user to click. Set globally in `tests/setup.ts`
 * so unit tests don't deadlock waiting for confirmation. Tests that
 * exercise the gate explicitly can flip to null per-test.
 */
let testMode: "auto-approve" | "auto-reject" | null = null;

function emit(): void {
    for (const s of subscribers) s(current);
}

/**
 * Request user confirmation before signing. Resolves to `true` on Confirm,
 * `false` on Cancel. The Provider must be mounted in the app tree;
 * otherwise the promise will pend forever.
 */
export function requestSignConfirmation(
    commitment: Commitment,
    agreement: Agreement | null,
): Promise<boolean> {
    if (testMode === "auto-approve") return Promise.resolve(true);
    if (testMode === "auto-reject") return Promise.resolve(false);
    if (current !== null) {
        // Concurrent request — reject the new one rather than queue.
        return Promise.resolve(false);
    }
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

/** Provider calls this when the user clicks Confirm. */
export function confirmPendingSign(): void {
    resolveCurrent?.(true);
}

/** Provider calls this when the user clicks Cancel or dismisses the modal. */
export function cancelPendingSign(): void {
    resolveCurrent?.(false);
}

/** Provider subscribes to receive `current` updates. Returns an unsubscribe fn. */
export function subscribeToPendingSign(fn: Subscriber): () => void {
    subscribers.add(fn);
    fn(current);
    return () => {
        subscribers.delete(fn);
    };
}

/** Test-only: reset the singleton to a clean state. */
export function _resetSignPreviewStore_TESTING_ONLY(): void {
    if (resolveCurrent) {
        resolveCurrent(false);
    }
    current = null;
    resolveCurrent = null;
    subscribers.clear();
    nextId = 1;
    testMode = null;
}

/**
 * Test-only: skip the modal and resolve `requestSignConfirmation`
 * immediately. Set in the global vitest setup so unit tests don't
 * deadlock waiting for a Provider that isn't mounted. Pass `null` to
 * restore normal Provider-driven behavior in a specific test.
 */
export function _setSignPreviewMode_TESTING_ONLY(
    mode: "auto-approve" | "auto-reject" | null,
): void {
    testMode = mode;
}
