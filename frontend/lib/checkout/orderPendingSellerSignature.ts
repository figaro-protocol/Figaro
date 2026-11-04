"use client";

/**
 * orderPendingSellerSignature.ts — the SELLER's preview (the read side).
 *
 * The mirror of the buyer's orderPreview: it surfaces orders the buyer has
 * signed and relayed that now await the seller's counter-signature. FigaroCore
 * knows nothing of "pending" — it is a purely off-chain coordination surface,
 * read from the coordination channel (the single source of truth) via
 * `subscribeAnyCommitmentPayload`, never reconstructed from local state.
 *
 * The channel is read through ONE subscription for the connected wallet,
 * shared by every consumer (`useCommitmentPayloadInbox`): it opens when the
 * first consumer mounts and closes when the last unmounts. It keeps every
 * payload this wallet is a party to and witnesses (signature-checks and pins)
 * the signed ones once. The `/orders` page and the header turn-badge read the
 * witnessed payloads through `usePendingSellerSignature`, diverging only in
 * the `match` predicate the caller passes; `/sign` reads every party payload
 * (an unsigned race draft included) while it listens. A relayed payload still
 * reads single-signed after its order is committed, so the pending view also
 * drops every payload whose order is already on-chain (`useIsUncommitted`):
 * both pending surfaces count the same orders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { hexEqual } from "@/lib/shared/evm";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import {
    deserializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro-protocol/sdk/agent";
import { computeOrderHash, verifyCommitmentSignature, type CoreEvents } from "@figaro-protocol/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { getCoreEvents, useWatchOrderEvents } from "@/lib/kernel/indexer";
import { publishAgreement } from "@/lib/kernel/agreementFetch";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { RuntimeServices } from "@/lib/shared/runtimeServices";
import type { WalletMessageSigner } from "@/lib/handoff/handoffMessagingService";
import { MAX_COMMITMENT_PAYLOAD_BYTES } from "@figaro-protocol/sdk/agent";
import type { Hex } from "viem";

/**
 * Am I (buyer or seller) a party to this commitment? Signature-state-agnostic
 * membership — the gate for any SIDE EFFECT taken on a received payload (the
 * agreement pin below). `COMMITMENT_PAYLOAD` carries no wallet-auth, so any
 * inbox that can DM this wallet can deliver one; without this gate a stranger's
 * payload gets pinned to THIS wallet's own IPFS node before any trust filter
 * (frontend security audit, finding 2 — pin-to-stranger's-node +
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
 * Is this payload's order still off-chain? Read from the indexer's one order
 * reader and kept live by the order-event watcher, both over every order
 * emitter. The predicate answers `false` while the read is in flight, when it
 * failed, and for a payload whose order hash cannot be computed: an order
 * whose chain state is unknown is not surfaced as pending.
 */
export function useIsUncommitted(): (payload: CommitmentPayload) => boolean {
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const core = CONTRACTS.core as `0x${string}` | undefined;
    const enabled = !isE2EMockSession() && !!publicClient && !!chainId && !!core;
    const [committed, setCommitted] = useState<ReadonlySet<string> | null>(null);

    useEffect(() => {
        setCommitted(null);
        if (!enabled || !publicClient) return;
        let canceled = false;
        getCoreEvents(publicClient, chainId)
            .then(({ events }) => {
                if (!canceled) setCommitted(new Set(events.orderCommitted.map((e) => e.orderHash.toLowerCase())));
            })
            .catch((err) => {
                if (!canceled) console.warn("[useIsUncommitted] order read failed:", err);
            });
        return () => {
            canceled = true;
        };
    }, [enabled, publicClient, chainId]);

    const onEvents = useCallback((events: CoreEvents) => {
        if (events.orderCommitted.length === 0) return;
        setCommitted((prev) =>
            prev ? new Set([...prev, ...events.orderCommitted.map((e) => e.orderHash.toLowerCase())]) : prev,
        );
    }, []);
    useWatchOrderEvents(onEvents, enabled);

    return useCallback(
        (payload: CommitmentPayload) => {
            if (!committed || !core || !chainId) return false;
            try {
                return !committed.has(computeOrderHash(payload.commitment, chainId, core).toLowerCase());
            } catch {
                return false;
            }
        },
        [committed, core, chainId],
    );
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

/** A payload received over the coordination channel for this wallet, which
 *  is a party to it: the parsed payload, its serialized body, its channel
 *  order id, and whether it was witnessed — at least one present signature
 *  recovers to its named party and its agreement is pinned. */
export interface InboxEntry {
    payload: CommitmentPayload;
    json: string;
    orderId: string;
    witnessed: boolean;
}

interface InboxState {
    entries: readonly InboxEntry[];
    /** `listening` once a consumer opened the channel; `error` when it could
     *  not be opened, with the reason in `error`. */
    status: "idle" | "listening" | "error";
    error: string | null;
}

const IDLE_INBOX: InboxState = { entries: [], status: "idle", error: null };
const useInboxStore = create<InboxState>(() => IDLE_INBOX);

/** The one open subscription: its identity (wallet, wallet-client presence,
 *  services) and how many consumers hold it. */
let active: { key: string; address: string; holders: number; close: () => void } | null = null;
/** The chain id the witness check reads at callback time, kept current by the
 *  consumers (a chain switch must not re-subscribe). */
let liveChainId: number | undefined;
const servicesIds = new WeakMap<object, number>();
let nextServicesId = 0;
function servicesId(services: object): number {
    let id = servicesIds.get(services);
    if (id === undefined) {
        id = nextServicesId++;
        servicesIds.set(services, id);
    }
    return id;
}

function addEntry(entry: InboxEntry): boolean {
    const { entries } = useInboxStore.getState();
    if (entries.some((e) => e.orderId === entry.orderId && e.json === entry.json)) return false;
    useInboxStore.setState({ entries: [...entries, entry] });
    return true;
}

function markWitnessed(entry: InboxEntry): void {
    useInboxStore.setState((state) => ({
        entries: state.entries.map((e) => (e === entry ? { ...e, witnessed: true } : e)),
    }));
}

/** Witness a party payload: a present signature must recover to its named
 *  party, then the agreement is pinned. Throws or returns false when not. */
async function witness(payload: CommitmentPayload, services: RuntimeServices): Promise<boolean> {
    if (!payload.commitment?.buyer || !payload.commitment?.seller) return false;
    // `isCommitmentParty` reads the sender-controlled buyer/seller
    // fields, so it alone lets a TARGETED attacker who simply NAMES
    // this wallet cause an ≤8 MB pin
    // (pin-amplification). Require a REAL signature: at least one
    // present signature must recover to its named party — proving a
    // genuine counterparty signed, not fabricated JSON. This keeps
    // both legitimate legs pinning (an outbound order carries this
    // wallet's OWN signature; an inbound one carries the
    // counterparty's) while dropping unsigned/forged payloads.
    const core = CONTRACTS.core;
    const cid = liveChainId;
    const recovers = async (sig: string | undefined, party: string) =>
        !!sig && !!core && !!cid
        && await verifyCommitmentSignature(
            payload.commitment, sig as Hex, party as Hex, { chainId: cid, core },
        ).catch(() => false);
    const signedByAParty =
        (await recovers(payload.buyerSig, payload.commitment.buyer))
        || (await recovers(payload.sellerSig, payload.commitment.seller));
    if (!signedByAParty) return false;
    // Persist the witnessed-URI pointer (+ standalone agreement
    // pin) for every payload where this wallet IS a party — it
    // witnessed the order, so its order/audit pages must be able to
    // hydrate the agreement by hash after a fresh navigation. Before
    // any consumer's filter: a party witnesses inbound AND outbound orders.
    await publishAgreement(payload.agreement, { evidenceTransport: services.evidenceTransport });
    return true;
}

function open(address: string, walletClient: WalletMessageSigner | null, services: RuntimeServices): () => void {
    let canceled = false;
    let unsubscribe: (() => void) | null = null;
    const isMock = isE2EMockSession();
    useInboxStore.setState({ status: "listening", error: null });

    void services.handoffMessaging
        .subscribeAnyCommitmentPayload({
            address,
            walletClient,
            callback: async (payloadJson, orderId) => {
                if (canceled) return;
                try {
                    // The payload arrives INLINE over the E2E-encrypted
                    // coordination channel (audit F Arm 2), not IPFS — no
                    // fetch. Cap its size defensively: a counterparty's inbox
                    // can deliver an oversize message; oversize → ignored.
                    if (new TextEncoder().encode(payloadJson).length > MAX_COMMITMENT_PAYLOAD_BYTES) return;
                    const payload = deserializeCommitmentPayload(payloadJson);
                    // The subscription is wallet-wide and the transport may not
                    // be addressed (the mock bus broadcasts): keep only payloads
                    // this wallet could ever act on — it must be a party. GATE
                    // the pin behind it too: `COMMITMENT_PAYLOAD` is
                    // unauthenticated, so a stranger's inbox can deliver one, and
                    // pinning it to THIS wallet's own IPFS node before checking
                    // involvement is a pin-to-stranger's-node +
                    // storage-amplification primitive (finding 2).
                    if (!payload.commitment || !isCommitmentParty(payload, address)) return;
                    const entry: InboxEntry = { payload, json: payloadJson, orderId, witnessed: false };
                    if (!addEntry(entry)) return;
                    // `?e2e=mock` sessions commit immediately and bypass the
                    // channel: nothing is witnessed or pinned there.
                    if (isMock) return;
                    if (await witness(payload, services)) markWitnessed(entry);
                } catch {
                    // Malformed payload or a failed pin — not witnessed.
                }
            },
        })
        .then((close) => {
            if (canceled) close();
            else unsubscribe = close;
        })
        .catch((err) => {
            if (canceled) return;
            useInboxStore.setState({ status: "error", error: extractErrorMessage(err, "Could not open the XMTP channel.") });
        });

    return () => {
        canceled = true;
        unsubscribe?.();
    };
}

/** Hold the shared subscription for `address`; returns the release. The last
 *  release closes it after the current commit, so a consumer whose effect
 *  re-runs (the wallet client arriving) hands it over without a gap. */
function hold(address: string, walletClient: WalletMessageSigner | null, services: RuntimeServices): () => void {
    const key = `${address.toLowerCase()}|${walletClient ? "signer" : "none"}|${servicesId(services)}`;
    if (active?.key === key) {
        active.holders += 1;
    } else {
        if (active) {
            active.close();
            if (!hexEqual(active.address, address)) useInboxStore.setState({ entries: [] });
        }
        active = { key, address, holders: 1, close: open(address, walletClient, services) };
    }
    const held = active;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        held.holders -= 1;
        if (held.holders > 0) return;
        queueMicrotask(() => {
            if (active !== held || held.holders > 0) return;
            held.close();
            active = null;
            useInboxStore.setState(IDLE_INBOX);
        });
    };
}

/**
 * The connected wallet's coordination-channel inbox, read through the ONE
 * shared subscription: every payload this wallet is a party to, in arrival
 * order, and the channel's status. `enabled: false` reads the inbox without
 * holding the subscription open.
 */
export function useCommitmentPayloadInbox(enabled = true): InboxState {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const chainId = useChainId();
    const services = useRuntimeServices();
    useEffect(() => {
        liveChainId = chainId;
    }, [chainId]);

    // The real-XMTP channel can only be CREATED with the wallet signer, and
    // wagmi resolves `walletClient` asynchronously — a subscription opened
    // before it resolves fails channel creation and would stay silently dead
    // (the badge-vs-orders-list divergence the relay smoke caught). So the
    // subscription is re-opened when the wallet arrives, never on every
    // render in between.
    const walletClientRef = useRef<WalletMessageSigner | null>(walletClient ?? null);
    walletClientRef.current = walletClient ?? null;
    const hasWalletClient = !!walletClient;

    useEffect(() => {
        if (!enabled || !address) return;
        return hold(address, walletClientRef.current, services);
    }, [enabled, address, hasWalletClient, services]);

    return useInboxStore();
}

/**
 * The witnessed payloads for the connected wallet that satisfy `match` and
 * whose order is not yet on-chain (`useIsUncommitted`), one per channel order
 * id. Returns the `pending` list plus `dismiss(index)`. Dismissal is shared
 * across every hook instance through a singleton store, so accepting /
 * dismissing on one surface immediately clears it everywhere. Suppressed in
 * `?e2e=mock` sessions (mock orders commit immediately and bypass the
 * channel).
 */
export function usePendingSellerSignature(
    match: (payload: CommitmentPayload, address: string) => boolean,
): { pending: CommitmentPayload[]; dismiss: (index: number) => void } {
    const { address } = useAccount();
    const isMock = isE2EMockSession();
    const { entries } = useCommitmentPayloadInbox(!isMock);
    const dismissed = useDismissedPending((s) => s.dismissed);
    const dismissOrder = useDismissedPending((s) => s.dismissOrder);
    const isUncommitted = useIsUncommitted();

    // Hide entries dismissed (or accepted) on ANY instance — the shared store
    // is the single source of that decision — and entries whose order is
    // already on-chain. `pending`/`dismiss` index into this visible list.
    const visible = useMemo(() => {
        if (isMock || !address) return [];
        const kept = new Set<string>();
        const matched: InboxEntry[] = [];
        for (const e of entries) {
            if (!e.witnessed || kept.has(e.orderId) || !match(e.payload, address)) continue;
            kept.add(e.orderId);
            matched.push(e);
        }
        return matched.filter((e) => !dismissed.has(e.orderId) && isUncommitted(e.payload));
    }, [isMock, address, entries, match, dismissed, isUncommitted]);
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
