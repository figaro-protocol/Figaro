"use client";

/**
 * orderPendingSellerSignature.ts — the SELLER's preview (the read side).
 *
 * The mirror of the buyer's orderPreview: it surfaces orders the buyer has
 * signed and relayed that now await the seller's counter-signature. The kernel
 * knows nothing of "pending" — it is a purely off-chain coordination surface,
 * read from the coordination channel (the single source of truth) via
 * `subscribeAnyCommitmentPayload`, never reconstructed from local state.
 *
 * Two surfaces consume this — the `/orders` page and the header turn-badge —
 * sharing one subscribe → fetch → deserialize → filter → accumulate path; they
 * diverge only in the `match` predicate the caller passes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { useAccount, useWalletClient } from "wagmi";
import { hexEqual } from "@/lib/shared/evm";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import {
    deserializeCommitmentPayload,
    type CommitmentPayload,
} from "@/lib/kernel/signedCommitment";
import { publishAgreement } from "@/lib/kernel/agreementFetch";
import { fetchCappedContent, type IpfsService } from "@/lib/shared/ipfsService";

/**
 * Awaiting MY counter-signature: I am a party, the OTHER party has signed, I
 * have not. The seller's /orders pending filter. (A seller-initiated order
 * reaches the BUYER's pending view the same way, so this is symmetric in the
 * parties.)
 */
export function awaitsMyCounterSign(p: CommitmentPayload, address: string): boolean {
    const isSeller = hexEqual(address, p.commitment.seller);
    const isBuyer = hexEqual(address, p.commitment.buyer);
    return (isSeller && !!p.buyerSig && !p.sellerSig)
        || (isBuyer && !!p.sellerSig && !p.buyerSig);
}

/**
 * I signed and relayed this, and it awaits the COUNTERPARTY's signature — my
 * outbound view (the order I placed, still in flight). Dual of the above.
 */
export function awaitsCounterpartySignature(p: CommitmentPayload, address: string): boolean {
    const isSeller = hexEqual(address, p.commitment.seller);
    const isBuyer = hexEqual(address, p.commitment.buyer);
    return (isBuyer && !!p.buyerSig && !p.sellerSig)
        || (isSeller && !!p.sellerSig && !p.buyerSig);
}

/**
 * Dismissed-order store — a process-wide singleton so every
 * `usePendingSellerSignature` mount (header badge + /orders accept surface)
 * shares one dismiss/accept decision. Without it, each instance accumulates its
 * own `pending` list and a dismissal in one leaves the other counting a stale
 * order. Keyed by the coordination-channel `orderId` (stable across instances).
 * Follows the codebase's zustand singleton-store idiom (`cartStore`,
 * `useOrderStore`).
 */
interface DismissedPendingStore {
    dismissed: ReadonlySet<string>;
    dismissOrder: (orderId: string) => void;
}

const useDismissedPending = create<DismissedPendingStore>((set) => ({
    dismissed: new Set<string>(),
    dismissOrder: (orderId) =>
        set((s) => {
            if (s.dismissed.has(orderId)) return s;
            const next = new Set(s.dismissed);
            next.add(orderId);
            return { dismissed: next };
        }),
}));

/** A witnessed payload tagged with its coordination-channel order id. */
interface PendingEntry {
    payload: CommitmentPayload;
    orderId: string;
}

/**
 * Subscribe to relayed payloads for the connected wallet, keeping those that
 * satisfy `match`. Returns the accumulated `pending` list plus `dismiss(index)`.
 * Dismissal is shared across every hook instance through a singleton store, so
 * accepting/dismissing on one surface immediately clears it everywhere.
 * Suppressed in `?e2e=mock` sessions (mock orders commit immediately and bypass
 * the channel).
 */
export function usePendingSellerSignature(
    match: (payload: CommitmentPayload, address: string) => boolean,
): { pending: CommitmentPayload[]; dismiss: (index: number) => void } {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const services = useRuntimeServices();

    const [entries, setEntries] = useState<PendingEntry[]>([]);
    const dismissed = useDismissedPending((s) => s.dismissed);
    const dismissOrder = useDismissedPending((s) => s.dismissOrder);
    const receivedOrderIds = useRef<Set<string>>(new Set());
    const subscribed = useRef(false);
    const isMock = isE2EMockSession();

    // Keep the latest predicate without re-subscribing — callers pass an inline
    // closure, but the subscription effect runs only on `address`.
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
                        // Resolve + fetch the payload by CID via the IPFS gateway.
                        const url = services.evidenceTransport.resolveFetchUrl(`ipfs://${payloadCid}`);
                        if (!url) return;
                        // Size-capped fetch (F4): the CID arrives over the
                        // coordination channel from a counterparty — oversize
                        // throws → the catch below → payload ignored.
                        const res = await fetchCappedContent(url);
                        if (!res.ok || cancelled) return;
                        const payload = deserializeCommitmentPayload(await res.text());
                        if (!payload.commitment?.buyer || !payload.commitment?.seller) return;
                        // Persist the witnessed-URI pointer (+ standalone agreement
                        // pin) for EVERY payload this wallet receives — it witnessed
                        // the order, so its order/audit pages must be able to hydrate
                        // the agreement by hash after a fresh navigation. Before the
                        // `match` filter: a wallet witnesses inbound AND outbound orders.
                        await publishAgreement(payload.agreement, { evidenceTransport: services.evidenceTransport });
                        if (!matchRef.current(payload, address)) return;
                        receivedOrderIds.current.add(orderId);
                        setEntries((prev) => [...prev, { payload, orderId }]);
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

    // Hide entries dismissed (or accepted) on ANY instance — the shared store
    // is the single source of that decision. `pending`/`dismiss` index into
    // this visible list.
    const visible = useMemo(
        () => entries.filter((e) => !dismissed.has(e.orderId)),
        [entries, dismissed],
    );
    const pending = useMemo(() => visible.map((e) => e.payload), [visible]);

    const dismiss = useCallback(
        (index: number) => {
            const entry = visible[index];
            if (entry) dismissOrder(entry.orderId);
        },
        [visible, dismissOrder],
    );

    return { pending, dismiss };
}

/**
 * Dereference an IPFS-pinned commitment payload to its JSON string.
 * Used by /orders-style subscribers that receive a CID and need the
 * underlying AnyCommitmentPayload JSON for parsing.
 */
export async function fetchCommitmentPayloadJsonByCid(
    ipfs: Pick<IpfsService, "resolveFetchUrl">,
    payloadCid: string,
): Promise<string> {
    const url = ipfs.resolveFetchUrl(`ipfs://${payloadCid}`);
    if (!url) {
        throw new Error(`Could not resolve IPFS gateway URL for CID: ${payloadCid}`);
    }
    // Size-capped fetch (F4): oversize throws, naming the cap.
    const res = await fetchCappedContent(url);
    if (!res.ok) {
        throw new Error(`IPFS fetch failed for CID ${payloadCid}: ${res.status} ${res.statusText}`);
    }
    return await res.text();
}
