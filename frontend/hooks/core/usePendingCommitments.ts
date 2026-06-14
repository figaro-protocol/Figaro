"use client";

/**
 * usePendingCommitments — shared subscriber for off-chain PENDING
 * commitments relayed over the coordination channel (real XMTP / mock).
 *
 * A "pending" commitment has been signed by one party and relayed, but is
 * not yet on-chain (no `OrderCommitted`). The kernel knows nothing of
 * pending — it is a purely off-chain coordination surface, read from the
 * channel's conversations (the single source of truth) via
 * `subscribeAnyCommitmentPayload`, never reconstructed from local state.
 *
 * Three surfaces consume this — the seller `/inbox` (commitments awaiting
 * MY counter-sign), the buyer `/orders` (commitments awaiting the
 * COUNTERPARTY's signature), and the header notification bell — sharing
 * one subscribe → fetch → deserialize → filter → accumulate path. They
 * diverge only in the `match` predicate the caller passes (and, on the
 * buyer side, an on-chain dedup at the call site). Lives in hooks/ rather
 * than lib/core/ because it depends on the handoff feature layer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { deserializePayload } from "@/lib/core/commitmentShare";
import type { CommitmentPayload } from "@/lib/core/useCommitmentFlow";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { fetchCommitmentPayloadJsonByCid } from "@/lib/handoff/coordinationMessagingService";
import { hexEqual } from "@/lib/shared/evm";
import { isE2EMockSession } from "@/lib/shared/e2e";

/**
 * Predicate: this commitment awaits MY counter-signature — I am a party,
 * the OTHER party has signed, I have not. The seller inbox's filter. The
 * usual direction is a seller counter-signing a buyer-initiated order; a
 * seller-initiated order (e.g. a dutch-auction claim relaying the
 * courier's signature) reaches the BUYER's inbox the same way.
 */
export function awaitsMyCounterSign(payload: CommitmentPayload, address: string): boolean {
    const isSeller = hexEqual(address, payload.commitment.seller);
    const isBuyer = hexEqual(address, payload.commitment.buyer);
    return (isSeller && !!payload.buyerSig && !payload.sellerSig)
        || (isBuyer && !!payload.sellerSig && !payload.buyerSig);
}

/**
 * Predicate: I signed and relayed this commitment, and it awaits the
 * COUNTERPARTY's signature — I am a party, I have signed, the other has
 * not. The buyer-outbound view on `/orders` (the order I placed, still in
 * flight to the seller). Dual of {@link awaitsMyCounterSign}.
 */
export function awaitsCounterpartySignature(payload: CommitmentPayload, address: string): boolean {
    const isSeller = hexEqual(address, payload.commitment.seller);
    const isBuyer = hexEqual(address, payload.commitment.buyer);
    return (isBuyer && !!payload.buyerSig && !payload.sellerSig)
        || (isSeller && !!payload.sellerSig && !payload.buyerSig);
}

/**
 * Subscribe to relayed commitment payloads for the connected wallet,
 * keeping those that satisfy `match`. Returns the accumulated `pending`
 * list plus `dismiss(index)` to drop one (used by the inbox after
 * accept/dismiss). The subscription is suppressed in `?e2e=mock` sessions
 * (mock orders commit immediately and bypass the channel).
 */
export function usePendingCommitments(
    match: (payload: CommitmentPayload, address: string) => boolean,
): { pending: CommitmentPayload[]; dismiss: (index: number) => void } {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const services = useRuntimeServices();

    const [pending, setPending] = useState<CommitmentPayload[]>([]);
    const receivedOrderIds = useRef<Set<string>>(new Set());
    const subscribed = useRef(false);
    const isMock = isE2EMockSession();

    // Keep the latest predicate without re-subscribing — callers pass an
    // inline closure, but the subscription effect runs only on `address`.
    const matchRef = useRef(match);
    matchRef.current = match;

    useEffect(() => {
        if (isMock || !address || subscribed.current) return;
        subscribed.current = true;
        let cleanup: (() => void) | null = null;
        let cancelled = false;

        void services.coordinationMessaging
            .subscribeAnyCommitmentPayload({
                address,
                walletClient: walletClient ?? null,
                callback: async (payloadCid, orderId) => {
                    if (cancelled || receivedOrderIds.current.has(orderId)) return;
                    try {
                        const payloadJson = await fetchCommitmentPayloadJsonByCid(
                            services.evidenceTransport,
                            payloadCid,
                        );
                        if (cancelled) return;
                        const payload = deserializePayload(payloadJson);
                        if (!payload.commitment?.buyer || !payload.commitment?.seller) return;
                        if (!matchRef.current(payload, address)) return;
                        receivedOrderIds.current.add(orderId);
                        setPending((prev) => [...prev, payload]);
                    } catch {
                        // Malformed payload or IPFS fetch failure — ignore.
                    }
                },
            })
            .then((unsubscribe) => {
                if (cancelled) {
                    unsubscribe();
                    return;
                }
                cleanup = unsubscribe;
            })
            .catch(() => {
                // Coordination messaging unavailable — silent.
            });

        return () => {
            cancelled = true;
            cleanup?.();
            subscribed.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address]);

    const dismiss = useCallback((index: number) => {
        setPending((prev) => prev.filter((_, i) => i !== index));
    }, []);

    return { pending, dismiss };
}
