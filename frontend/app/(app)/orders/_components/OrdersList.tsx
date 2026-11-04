"use client";

/**
 * OrdersList — the connected wallet's single orders surface at `/orders`,
 * actor-neutral: every order the wallet is on, whether it is buyer or seller,
 * plus anything that order needs from it. There is no separate "inbox" — buyer
 * and seller are the same wallet reading the same network state; splitting them
 * by role was the closed-world mistake.
 *
 * Sections, top to bottom:
 *   1. Your turn           — relayed commitments awaiting THIS wallet's
 *                            counter-signature (accept / dismiss). The only
 *                            off-chain action-required state; derived from the
 *                            coordination channel, never stored.
 *   2. Signed, not yet sent — commitments this wallet signed but has not
 *                            relayed (kept for the tab; Send / Discard).
 *   3. Awaiting acceptance — commitments this wallet signed and relayed,
 *                            waiting on the counterparty (read-only).
 *   4. In progress         — active on-chain processes (buyer OR seller).
 *   5. Completed           — resolved processes (buyer OR seller).
 *
 * "Needs my action" is a DERIVED view, not a notification system. The header
 * `YourTurnBadge` (a count) and an agent's event subscription read the same
 * derived signal through device-appropriate transports.
 */

import Link from "@/components/shared/Link";
import { useCallback, useMemo, useState } from "react";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { useViewedWallet } from "@/lib/shared/viewedWallet";
import { calculateBonds } from "@figaro-protocol/sdk";
import { tokenFigure } from "@/lib/shared/utils";
import { ZERO_ADDRESS, hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatBlockTimestamp } from "@/lib/shared/formatTimestamp";
import { Button } from "@/components/ui/Button";
import { WalletGate, STRANGER_EXPLAINER } from "@/components/runtime/WalletGate";
import { useWalletProcessRows, type ProcessRow } from "@/lib/kernel/walletProcessQueries";
import { useOrderCommitmentFlow } from "@/lib/checkout/orderCommitmentFlow";
import { shareSignedOrder } from "@/lib/checkout/orderSignedAndShared";
import { forgetSignedUnsent, useSignedUnsentOrders, type SignedUnsentOrder } from "@/lib/checkout/signedUnsentOrders";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { computeOrderHash } from "@figaro-protocol/sdk";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CONTRACTS } from "@/lib/kernel/contracts";
import {
    usePendingSellerSignature,
    useIsUncommitted,
    awaitsMyCounterSign,
    awaitsCounterpartySignature,
    awaitsMyBroadcast,
} from "@/lib/checkout/orderPendingSellerSignature";
import { useMemberListings } from "@/lib/member/useMemberListings";
import { displayNameForAddress } from "@/lib/member/memberListing";
import type { Listing } from "@/lib/member/memberListing";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useMounted } from "@/hooks/useMounted";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import useTokenApproval from "@/hooks/useTokenApproval";
import { useApproveThenAct } from "@/hooks/useApproveThenAct";
import { ABSENT, PENDING, present, type NetworkRead } from "@/lib/shared/networkRead";



// ── Your-turn card: a relayed order whose next act is mine ──
// Two acts reach this card, and they differ only in their words:
//   accept — an incoming order awaiting my counter-signature (Your turn): as
//            the seller of a buyer's order, or as the buyer of an order a
//            seller originated (`awaitsMyCounterSign` is symmetric);
//   submit — fully signed and relayed back to me (the dispatch race's last
//            mile): the buyer signed my countersigned draft, and I broadcast.
// Either act pulls my own bond, 2 × payment as buyer or 2 × cumulative value
// as seller, so the Core must be allowed to pull it from this wallet. The approval runs INSIDE the act's flow, after its confirm and
// before the broadcast: a seller who reads the terms and declines has sent no
// transaction and left no allowance. A prior max approval just makes
// needsApproval false → no-op.
const TURN_WORDS = {
    accept: {
        cardTestId: "order-your-turn-card",
        heading: "New order to accept",
        bondNote: "(returned at resolution)",
        actTestId: "btn-accept-order",
        act: "Accept order",
        acting: "Signing…",
        dismissTestId: "btn-dismiss-order",
    },
    submit: {
        cardTestId: "order-ready-to-submit-card",
        heading: "Fully signed — submit on-chain",
        bondNote: "(locked at submit, returned at resolution)",
        actTestId: "btn-submit-ready-order",
        act: "Submit on-chain",
        acting: "Submitting…",
        dismissTestId: "btn-dismiss-ready-order",
    },
} as const;

export function YourTurnCard({ act, payload, onAct, onDismiss, isActing, listings }: {
    act: keyof typeof TURN_WORDS;
    payload: CommitmentPayload;
    /** Opens the act's flow, handing it the bond-approval step it runs after
     *  the flow's confirm and before the broadcast. */
    onAct: (beforeBroadcast: () => Promise<void>) => void;
    onDismiss: () => void;
    isActing: boolean;
    listings: ReadonlyArray<Listing>;
}) {
    const words = TURN_WORDS[act];
    const { commitment } = payload;
    const { address } = useAccount();
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    // The bond is the acting party's own: a buyer counter-signing a
    // seller-initiated order locks 2 × payment, a seller 2 × cumulative value.
    const role = hexEqual(address, commitment.buyer) ? "buyer" : "seller";
    const bonds = calculateBonds(commitment.expectedCumulativeValue, commitment.payment);
    const myBond = role === "buyer" ? bonds.buyerBond : bonds.sellerBond;
    const core = CONTRACTS.core as `0x${string}` | undefined;
    const { needsApproval, approve, isApprovePending, isApproveConfirming, isApproveSuccess, isApproveError } = useTokenApproval({
        tokenAddress: commitment.currency as `0x${string}`,
        owner: address,
        spender: (core ?? ZERO_ADDRESS) as `0x${string}`,
    });
    const { ensureApproval } = useApproveThenAct({ needsApproval, approve, isApproveSuccess, isApproveError });
    const isApproving = isApprovePending || isApproveConfirming;
    const handleAct = () => onAct(() => ensureApproval(myBond));

    return (
        <div className="rounded-lg border border-default bg-paper p-5 space-y-4" data-testid={words.cardTestId}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-muted mb-1">{words.heading}</p>
                    <p className="text-sm font-mono text-ink-body">
                        From {displayNameForAddress(listings, commitment.buyer)}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-ink-muted">Order value</p>
                    <p className="text-sm font-semibold text-ink-primary">{tokenFigure(commitment.payment, decimals)}</p>
                </div>
            </div>
            <div className="rounded border border-default bg-subtle p-3 text-xs text-ink-body space-y-1">
                <p>
                    <span className="font-medium text-ink-body">{role === "buyer" ? "Your buyer bond:" : "Your seller bond:"}</span>{" "}
                    {tokenFigure(myBond, decimals)}
                    <span className="text-ink-muted ml-1">{words.bondNote}</span>
                </p>
            </div>
            <div className="flex gap-2">
                <Button type="button" onClick={handleAct} disabled={isActing || isApproving} className="flex-1" data-testid={words.actTestId}>
                    {isApproving ? "Approving bond…" : isActing ? words.acting : words.act}
                </Button>
                <button
                    type="button"
                    onClick={onDismiss}
                    disabled={isActing || isApproving}
                    className="rounded border border-default px-3 py-2 text-sm text-ink-muted hover:bg-subtle disabled:opacity-40"
                    data-testid={words.dismissTestId}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

// The other party on an outbound commitment, read from the connected wallet's
// side: a seller may originate and relay an order for its buyer to counter-sign,
// so the wallet that signed first is either party.
function outboundCounterparty(commitment: CommitmentPayload["commitment"], address: string | undefined): string {
    return hexEqual(address, commitment.seller) ? commitment.buyer : commitment.seller;
}

// ── Signed, not yet sent: I signed, the relay has not happened — Send / Discard ──
export function SignedUnsentRow({
    entry, address, listings, onSend, onDiscard, sending, error,
}: {
    entry: SignedUnsentOrder;
    address: string | undefined;
    listings: ReadonlyArray<Listing>;
    onSend: () => void;
    onDiscard: () => void;
    sending: boolean;
    error: string | null;
}) {
    const { commitment } = entry.payload;
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const counterpartyName = displayNameForAddress(listings, outboundCounterparty(commitment, address));
    return (
        <div className="block rounded-lg border border-default bg-paper p-4" data-testid="order-unsent-row">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-sm font-semibold text-ink-primary truncate">{counterpartyName}</h2>
                        <span
                            className="inline-flex items-center rounded-full border border-default px-2.5 py-0.5 text-xs font-semibold text-ink-muted"
                            data-testid="order-unsent-status"
                        >
                            Signed, not yet sent
                        </span>
                    </div>
                    {sending ? (
                        <p className="mt-1 text-xs text-ink-muted" role="status" data-testid="order-unsent-sending">
                            Sending the signed order to {counterpartyName}. Waiting for the channel to accept it.
                        </p>
                    ) : (
                        <p className="mt-1 text-xs text-ink-muted">
                            You signed this order; {counterpartyName} has not received it. It stays here for this tab.
                        </p>
                    )}
                    {error && <p className="mt-1 text-xs text-error-fg" data-testid="order-unsent-error">{error}</p>}
                </div>
                <div className="text-right shrink-0 space-y-2">
                    <p className="text-xs text-ink-muted">Order value</p>
                    <p className="text-sm font-semibold text-ink-primary">{tokenFigure(commitment.payment, decimals)}</p>
                    <div className="flex gap-2 justify-end">
                        <Button variant="secondary" size="sm" onClick={onDiscard} disabled={sending} data-testid="btn-discard-unsent">
                            Discard
                        </Button>
                        <Button size="sm" onClick={onSend} disabled={sending} data-testid="btn-send-unsent">
                            {sending ? "Sending…" : "Send"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Outbound pending row: I signed and relayed, awaiting the counterparty ──
export function AwaitingAcceptanceRow({ payload, address, listings, onDismiss }: { payload: CommitmentPayload; address: string | undefined; listings: ReadonlyArray<Listing>; onDismiss: () => void }) {
    const { commitment } = payload;
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const counterpartyName = displayNameForAddress(listings, outboundCounterparty(commitment, address));
    return (
        <div className="block rounded-lg border border-default bg-paper p-4" data-testid="order-pending-row">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-sm font-semibold text-ink-primary truncate">{counterpartyName}</h2>
                        <span
                            className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning-fg"
                            data-testid="order-pending-status"
                        >
                            Awaiting acceptance
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted" data-testid="order-pending-no-bond">
                        Waiting for {counterpartyName} to counter-sign. Nothing has moved: no bond is locked until the order is committed.
                    </p>
                    <p className="mt-1 text-xs text-ink-muted" data-testid="order-pending-deadline">
                        After its deadline, {formatBlockTimestamp(commitment.deadline)}, it can no longer be committed.
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-ink-muted">Order value</p>
                    <p className="text-sm font-semibold text-ink-primary">{tokenFigure(commitment.payment, decimals)}</p>
                </div>
            </div>
            <div className="mt-3 flex justify-end">
                <button
                    type="button"
                    onClick={onDismiss}
                    className="rounded border border-default px-3 py-2 text-sm text-ink-muted hover:bg-subtle"
                    data-testid="btn-dismiss-pending"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

// ── On-chain process row (the wallet is buyer or seller on it) ──
function OrderRow({ row, listings }: { row: ProcessRow; listings: ReadonlyArray<Listing> }) {
    const { decimals } = useTokenDecimals(row.currency as `0x${string}` | undefined);
    return (
        <Link
            href={`/orders/view?process=${row.processId}`}
            className="block rounded-lg border border-default bg-paper p-4 hover:border-default-strong transition-colors"
            data-testid={`order-row-${row.processId}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-sm font-semibold text-ink-primary truncate">
                            {displayNameForAddress(listings, row.counterparty)}
                        </h2>
                        <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                row.isResolved
                                    ? "border-success/30 bg-success/10 text-success-fg"
                                    : "border-info/30 bg-info/10 text-info-fg"
                            }`}
                            data-testid={`order-status-${row.processId}`}
                        >
                            {row.isResolved ? "Completed" : "In progress"}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted font-mono">
                        Process {truncateHex(row.processId, { head: 10, tail: 6 })}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-ink-muted">Order value</p>
                    <p className="text-sm font-semibold text-ink-primary">{tokenFigure(row.payment, decimals)}</p>
                </div>
            </div>
        </Link>
    );
}

export function OrdersList() {
    const { address, isConnected } = useAccount();
    const mounted = useMounted();
    const chainId = useChainId();
    // Reading is walletless: a reader may name any address with ?wallet=.
    // Acting (accept, counter-sign, resolve) still needs the connected wallet.
    const viewed = useViewedWallet(address);
    const buyer = useWalletProcessRows("buyer", viewed);
    const seller = useWalletProcessRows("seller", viewed);
    const { read: listingsRead } = useMemberListings();
    // Names come only from listings the registry returned; an absent read
    // names no one (the address itself is shown).
    const listings = useMemo(() => (listingsRead.status === "present" ? listingsRead.value : []), [listingsRead]);
    const isMock = isE2EMockSession();

    // Merge buyer + seller rows — the wallet sees every order it's on, deduped
    // by the committed order hash, newest first.
    // A failed read on either side is absent: no rows, no empty state.
    const ordersRead = useMemo<NetworkRead<ProcessRow[]>>(() => {
        if (buyer.read.status === "absent" || seller.read.status === "absent") return ABSENT;
        if (buyer.read.status === "pending" || seller.read.status === "pending") return PENDING;
        const byHash = new Map<string, ProcessRow>();
        for (const r of [...buyer.read.value, ...seller.read.value]) {
            const key = r.rootOrderHash.toLowerCase();
            if (!byHash.has(key)) byHash.set(key, r);
        }
        return present([...byHash.values()].sort((a, b) => b.blockNumber - a.blockNumber));
    }, [buyer.read, seller.read]);
    const rows = ordersRead.status === "present" ? ordersRead.value : [];

    // YOUR TURN — relayed commitments awaiting my counter-signature (accept).
    const { pending: incoming, dismiss: dismissIncoming } = usePendingSellerSignature(awaitsMyCounterSign);
    const { acceptOrder, commitOrder, error: flowError, reset, step: flowStep } = useOrderCommitmentFlow();
    const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
    const [acceptError, setAcceptError] = useState<string | null>(null);

    const handleAccept = useCallback(async (index: number, beforeBroadcast: () => Promise<void>) => {
        const payload = incoming[index];
        if (!payload) return;
        // Off-chain validation (checkout-hash recompute) is enforced inside the flow's sign
        // step — acceptOrder throws on mismatch and the catch below surfaces it.
        // The seller-bond approval runs after the terms confirm (beforeBroadcast).
        setAcceptingIndex(index);
        setAcceptError(null);
        try {
            await acceptOrder(payload, undefined, { beforeBroadcast });
            dismissIncoming(index);
            reset();
        } catch (cause: unknown) {
            setAcceptError(extractErrorMessage(cause, "Signing failed"));
        } finally {
            setAcceptingIndex(null);
        }
    }, [incoming, acceptOrder, reset, dismissIncoming]);

    // READY TO SUBMIT — fully-signed payloads relayed to me as seller (the
    // race's last mile): my countersigned draft came back with the buyer's
    // signature; broadcasting is mine.
    const { pending: readyToSubmit, dismiss: dismissReady } = usePendingSellerSignature(awaitsMyBroadcast);
    const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleSubmitReady = useCallback(async (index: number, beforeBroadcast: () => Promise<void>) => {
        const payload = readyToSubmit[index];
        if (!payload) return;
        // The seller-bond approval runs after the commit confirm (beforeBroadcast).
        setSubmittingIndex(index);
        setSubmitError(null);
        try {
            await commitOrder(payload, { beforeBroadcast });
            dismissReady(index);
            reset();
        } catch (cause: unknown) {
            setSubmitError(extractErrorMessage(cause, "Submit failed"));
        } finally {
            setSubmittingIndex(null);
        }
    }, [readyToSubmit, commitOrder, dismissReady, reset]);

    // AWAITING ACCEPTANCE — commitments I relayed, waiting on the counterparty.
    const { pending: outbound, dismiss: dismissOutbound } = usePendingSellerSignature(awaitsCounterpartySignature);

    // SIGNED, NOT YET SENT — the tab's copy of what I signed but never relayed.
    const unsent = useSignedUnsentOrders(address, chainId);
    const { data: walletClient } = useWalletClient();
    const { handoffMessaging, evidenceTransport } = useRuntimeServices();
    const [sendingUnsent, setSendingUnsent] = useState<string | null>(null);
    const [unsentError, setUnsentError] = useState<Record<string, string>>({});
    const sendUnsent = useCallback(async (entry: SignedUnsentOrder) => {
        if (!address || !chainId) return;
        setSendingUnsent(entry.orderId);
        setUnsentError((prev) => { const { [entry.orderId]: _e, ...rest } = prev; return rest; });
        try {
            const orderId = await shareSignedOrder({
                payload: entry.payload,
                recipientAddress: entry.payload.commitment.seller,
                senderAddress: address,
                walletClient,
                chainId,
                handoffMessaging,
                evidenceTransport,
            });
            forgetSignedUnsent({ address, chainId, orderId });
        } catch (error) {
            setUnsentError((prev) => ({ ...prev, [entry.orderId]: extractErrorMessage(error, "Failed to send the order.") }));
        } finally {
            setSendingUnsent(null);
        }
    }, [address, chainId, walletClient, handoffMessaging, evidenceTransport]);

    // The pending lists above already drop every payload whose order is on-chain
    // (`usePendingSellerSignature`); the tab's unsent copies go through the
    // same predicate, and drop once their order is relayed.
    const { isUncommitted, known: uncommittedKnown } = useIsUncommitted();
    const core = CONTRACTS.core as `0x${string}` | undefined;
    const relayedIds = new Set(
        chainId && core
            ? outbound.map((p) => { try { return computeOrderHash(p.commitment, chainId, core).toLowerCase(); } catch { return ""; } })
            : [],
    );
    const visibleUnsent = unsent.filter((e) => isUncommitted(e.payload) && !relayedIds.has(e.orderId.toLowerCase()));

    const activeRows = rows.filter((r) => !r.isResolved);
    const completedRows = rows.filter((r) => r.isResolved);
// The empty state needs every read it rests on to have answered: the orders and the
    // pending predicate's read of them; a failed read of either shows no sentence.
    const nothing = ordersRead.status === "present" && uncommittedKnown && rows.length === 0 && incoming.length === 0 && outbound.length === 0 && readyToSubmit.length === 0 && visibleUnsent.length === 0;

    return (
        <div data-testid="orders-list" className="container mx-auto px-6 py-10 max-w-3xl space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-ink-primary">Orders</h1>
                <p className="mt-2 text-sm text-ink-body">
                    Every order you&apos;re on — buyer or seller — and anything that needs you.
                </p>
            </header>

            {/* Gate on mounted: the server renders the disconnected branch, so the
                first client render must too (wagmi restores the connection
                synchronously from storage — branching on it during hydration is
                React #418/#423/#425). Real state takes over post-mount. */}
            {!mounted || (!isConnected && !viewed) ? (
                <WalletGate explainer={STRANGER_EXPLAINER} hint="Connect a wallet to see your orders, or name any address with ?wallet=0x… to read its orders.">
                    <div className="rounded-lg border border-default bg-paper p-5 text-sm text-ink-muted">
                        Connect a wallet to see your orders, or add <code>?wallet=0x…</code> to this address to read any wallet&apos;s. Every order is public.
                    </div>
                </WalletGate>
            ) : (
                <>
                    {!isMock && incoming.length > 0 && (
                        <section className="space-y-3" data-testid="orders-your-turn-section">
                            <p className="text-xs font-semibold text-ink-muted">Your turn</p>
                            <div className="space-y-3">
                                {incoming.map((payload, index) => (
                                    <YourTurnCard
                                        key={index}
                                        act="accept"
                                        payload={payload}
                                        onAct={(beforeBroadcast) => void handleAccept(index, beforeBroadcast)}
                                        onDismiss={() => dismissIncoming(index)}
                                        isActing={acceptingIndex === index || flowStep === "signing" || flowStep === "committing"}
                                        listings={listings}
                                    />
                                ))}
                            </div>
                            {(acceptError ?? flowError) && (
                                <p className="text-sm text-error-fg" data-testid="orders-your-turn-error">{acceptError ?? flowError}</p>
                            )}
                        </section>
                    )}

                    {!isMock && readyToSubmit.length > 0 && (
                        <section className="space-y-3" data-testid="orders-ready-section">
                            <p className="text-xs font-semibold text-ink-muted">Ready to submit</p>
                            <div className="space-y-3">
                                {readyToSubmit.map((payload, index) => (
                                    <YourTurnCard
                                        key={`ready-${index}`}
                                        act="submit"
                                        payload={payload}
                                        onAct={(beforeBroadcast) => void handleSubmitReady(index, beforeBroadcast)}
                                        onDismiss={() => dismissReady(index)}
                                        isActing={submittingIndex === index}
                                        listings={listings}
                                    />
                                ))}
                            </div>
                            {submitError && (
                                <p className="text-sm text-error-fg" data-testid="orders-ready-error">{submitError}</p>
                            )}
                        </section>
                    )}

                    {visibleUnsent.length > 0 && address && (
                        <section className="space-y-3" data-testid="orders-unsent-section">
                            <p className="text-xs font-semibold text-ink-muted">Signed, not yet sent</p>
                            <ul className="space-y-3" data-testid="orders-unsent">
                                {visibleUnsent.map((entry) => (
                                    <li key={`unsent-${entry.orderId}`}>
                                        <SignedUnsentRow
                                            entry={entry}
                                            address={address}
                                            listings={listings}
                                            sending={sendingUnsent === entry.orderId}
                                            error={unsentError[entry.orderId] ?? null}
                                            onSend={() => void sendUnsent(entry)}
                                            onDiscard={() => chainId && forgetSignedUnsent({ address, chainId, orderId: entry.orderId })}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {outbound.length > 0 && (
                        <section className="space-y-3" data-testid="orders-pending-section">
                            <p className="text-xs font-semibold text-ink-muted">Awaiting acceptance</p>
                            <ul className="space-y-3" data-testid="orders-pending">
                                {outbound.map((payload, index) => (
                                    <li key={`pending-${index}`}>
                                        <AwaitingAcceptanceRow payload={payload} address={address} listings={listings} onDismiss={() => dismissOutbound(index)} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {nothing ? (
                        <div className="rounded-lg border border-default bg-paper p-6 space-y-3" data-testid="orders-empty">
                            <p className="text-sm text-ink-body">You haven&apos;t placed or received any orders yet.</p>
                            <Link
                                href="/discover"
                                className="inline-block rounded border border-ink-heading px-4 py-2 text-sm font-semibold text-ink-primary hover:bg-subtle"
                                data-testid="link-discover-from-orders-empty"
                            >
                                Browse sellers →
                            </Link>
                        </div>
                    ) : ordersRead.status === "absent" ? null : (
                        <>
                            <section className="space-y-3" data-testid="orders-active-section">
                                <p className="text-xs font-semibold text-ink-muted">In progress</p>
                                {ordersRead.status === "pending" ? (
                                    <p className="text-sm text-ink-muted" data-testid="orders-loading">Loading…</p>
                                ) : activeRows.length === 0 ? (
                                    <div className="rounded-lg border border-default bg-paper p-5 text-sm text-ink-muted" data-testid="orders-active-empty">
                                        No orders in progress.
                                    </div>
                                ) : (
                                    <ul className="space-y-3" data-testid="orders-active">
                                        {activeRows.map((row) => (
                                            <li key={row.processId}><OrderRow row={row} listings={listings} /></li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            {completedRows.length > 0 && (
                                <section className="space-y-3" data-testid="orders-completed-section">
                                    <p className="text-xs font-semibold text-ink-muted">Completed</p>
                                    <ul className="space-y-3" data-testid="orders-completed">
                                        {completedRows.map((row) => (
                                            <li key={row.processId}><OrderRow row={row} listings={listings} /></li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
