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
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { hexEqual } from "@/lib/shared/evm";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import {
    deserializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro/sdk/agent";
import { verifyCommitmentSignature } from "@figaro/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { publishAgreement } from "@/lib/kernel/agreementFetch";
import { type IpfsService } from "@/lib/shared/ipfsService";
import { MAX_INLINE_PAYLOAD_BYTES } from "@/lib/checkout/orderSignedAndShared";
import type { Hex } from "viem";

/**
 * Am I (buyer or seller) a party to this commitment? Signature-state-agnostic
 * membership — the gate for any SIDE EFFECT taken on a received payload (the
 * agreement pin below). `COMMITMENT_PAYLOAD` carries no wallet-auth, so any
 * inbox that can DM this wallet can deliver one; without this gate a stranger's
 * payload gets pinned to THIS wallet's own IPFS node before any trust filter
 * (frontend security audit 2026-07-22, finding 2 — pin-to-stranger's-node +
 * storage-amplification). Display filters (`match`) are narrower still; this is
 * the coarse "am I even involved" floor.
 */
export function isCommitmentParty(p: CommitmentPayload, address: string): boolean {
    return hexEqual(address, p.commitment.buyer) || hexEqual(address, p.commitment.seller);
}

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
 * Fully signed and relayed to ME as the seller — my turn to broadcast. The
 * dispatch race's last mile: the buyer signed the winning countersigned draft
 * and relayed it back carrying BOTH signatures; the winner submits on-chain
 * (and pays gas), exactly as an accepted order would. Not race-specific: any
 * fully-signed payload relayed to its seller lands here.
 */
export function awaitsMyBroadcast(p: CommitmentPayload, address: string): boolean {
    return hexEqual(address, p.commitment.seller) && !!p.buyerSig && !!p.sellerSig;
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
    const chainId = useChainId();
    const services = useRuntimeServices();
    // Read at callback time without re-subscribing (mirrors walletClientRef).
    const chainIdRef = useRef(chainId);
    chainIdRef.current = chainId;

    const [entries, setEntries] = useState<PendingEntry[]>([]);
    const dismissed = useDismissedPending((s) => s.dismissed);
    const dismissOrder = useDismissedPending((s) => s.dismissOrder);
    const receivedOrderIds = useRef<Set<string>>(new Set());
    const subscribed = useRef(false);
    const isMock = isE2EMockSession();

    // Keep the latest predicate without re-subscribing — callers pass an inline
    // closure, but the subscription effect runs only on `address` (and wallet
    // availability, below).
    const matchRef = useRef(match);
    matchRef.current = match;

    // The real-XMTP channel can only be CREATED with the wallet signer, and
    // wagmi resolves `walletClient` asynchronously — an instance whose effect
    // runs before it resolves fails channel creation and would stay silently
    // dead (the badge-vs-orders-list divergence the relay smoke caught). So
    // the effect also re-runs when the wallet arrives; the ref keeps the
    // effect from re-subscribing on every render in between.
    const walletClientRef = useRef(walletClient);
    walletClientRef.current = walletClient;
    const hasWalletClient = !!walletClient;

    useEffect(() => {
        if (isMock || !address || subscribed.current) return;
        subscribed.current = true;
        let cleanup: (() => void) | null = null;
        let cancelled = false;

        void services.coordinationMessaging
            .subscribeAnyCommitmentPayload({
                address,
                walletClient: walletClientRef.current ?? null,
                callback: async (payloadJson, orderId) => {
                    if (cancelled || receivedOrderIds.current.has(orderId)) return;
                    try {
                        // The payload arrives INLINE over the E2E-encrypted
                        // coordination channel (audit F Arm 2), not IPFS — no
                        // fetch. Cap its size defensively: a counterparty's inbox
                        // can deliver an oversize message; oversize → ignored.
                        if (new TextEncoder().encode(payloadJson).length > MAX_INLINE_PAYLOAD_BYTES) return;
                        const payload = deserializeCommitmentPayload(payloadJson);
                        if (cancelled) return;
                        if (!payload.commitment?.buyer || !payload.commitment?.seller) return;
                        // GATE the pin behind party membership. `COMMITMENT_PAYLOAD`
                        // is unauthenticated, so a stranger's inbox can deliver one;
                        // pinning it to THIS wallet's own IPFS node before checking
                        // involvement is a pin-to-stranger's-node + storage-amplification
                        // primitive (finding 2). A NON-party has no witness claim to
                        // hydrate later, so it has no reason to pin.
                        if (!isCommitmentParty(payload, address)) return;
                        // `isCommitmentParty` reads the sender-controlled buyer/seller
                        // fields, so it alone lets a TARGETED attacker who simply NAMES
                        // this wallet cause an ≤8 MB pin (audit 2026-07-23,
                        // pin-amplification). Require a REAL signature: at least one
                        // present signature must recover to its named party — proving a
                        // genuine counterparty signed, not fabricated JSON. This keeps
                        // both legitimate legs pinning (an outbound order carries this
                        // wallet's OWN signature; an inbound one carries the
                        // counterparty's) while dropping unsigned/forged payloads.
                        const core = CONTRACTS.core;
                        const cid = chainIdRef.current;
                        const recovers = async (sig: string | undefined, party: string) =>
                            !!sig && !!core && !!cid
                            && await verifyCommitmentSignature(
                                payload.commitment, sig as Hex, party as Hex, { chainId: cid, core },
                            ).catch(() => false);
                        const signedByAParty =
                            (await recovers(payload.buyerSig, payload.commitment.buyer))
                            || (await recovers(payload.sellerSig, payload.commitment.seller));
                        if (!signedByAParty) return;
                        // Persist the witnessed-URI pointer (+ standalone agreement
                        // pin) for every payload where this wallet IS a party — it
                        // witnessed the order, so its order/audit pages must be able to
                        // hydrate the agreement by hash after a fresh navigation. Before
                        // the `match` filter: a party witnesses inbound AND outbound orders.
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
    }, [address, hasWalletClient]);

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

