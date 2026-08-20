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
 *   2. Awaiting acceptance — commitments this wallet signed and relayed,
 *                            waiting on the counterparty (read-only).
 *   3. In progress         — active on-chain processes (buyer OR seller).
 *   4. Completed           — resolved processes (buyer OR seller).
 *
 * "Needs my action" is a DERIVED view, not a notification system. The header
 * `YourTurnBadge` (a count) and an agent's event subscription read the same
 * derived signal through device-appropriate transports.
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { calculateBonds } from "@figaro-protocol/sdk";
import { formatToken } from "@/lib/shared/utils";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { Button } from "@/components/ui/Button";
import { WalletGate, STRANGER_EXPLAINER } from "@/components/runtime/WalletGate";
import { useWalletProcessRows, type ProcessRow } from "@/lib/kernel/walletProcessQueries";
import { useOrderCommitmentFlow } from "@/lib/checkout/orderCommitmentFlow";
import { type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { computeOrderHash } from "@figaro-protocol/sdk";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CONTRACTS } from "@/lib/kernel/contracts";
import {
    usePendingSellerSignature,
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

// ── Your-turn card: an incoming order awaiting my counter-signature ──
function YourTurnCard({ payload, onAccept, onDismiss, isAccepting, listings }: {
    payload: CommitmentPayload;
    onAccept: () => void;
    onDismiss: () => void;
    isAccepting: boolean;
    listings: ReadonlyArray<Listing>;
}) {
    const { commitment } = payload;
    const { address } = useAccount();
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const sellerBond = calculateBonds(commitment.expectedCumulativeValue, commitment.payment).sellerBond;

    // The seller locks 2× cumulative value as bond, so the kernel must be allowed
    // to pull it from this wallet. Mirror the buyer's checkout: if the allowance
    // is short, approve the bond first, then resume the accept once the approve
    // confirms (the buyer approves its own bond at checkout — this is the seller's
    // missing half). A prior max approval just makes needsApproval false → no-op.
    const core = CONTRACTS.core as `0x${string}` | undefined;
    const { needsApproval, approve, isApprovePending, isApproveConfirming, isApproveSuccess } = useTokenApproval({
        tokenAddress: commitment.currency as `0x${string}`,
        owner: address,
        spender: (core ?? ZERO_ADDRESS) as `0x${string}`,
    });
    const { runWithApproval } = useApproveThenAct({ needsApproval, approve, isApproveSuccess });
    const isApproving = isApprovePending || isApproveConfirming;
    const handleAccept = () => runWithApproval(sellerBond, onAccept);

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4" data-testid="order-your-turn-card">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-500 mb-1">New order to accept</p>
                    <p className="text-sm font-mono text-neutral-700">
                        From {displayNameForAddress(listings, commitment.buyer)}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Order value</p>
                    <p className="text-sm font-semibold text-black">{formatToken(commitment.payment, decimals)}</p>
                </div>
            </div>
            <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600 space-y-1">
                <p>
                    <span className="font-medium text-neutral-700">Your seller bond:</span>{" "}
                    {formatToken(sellerBond, decimals)}
                    <span className="text-neutral-400 ml-1">(returned at settlement)</span>
                </p>
            </div>
            <div className="flex gap-2">
                <Button type="button" onClick={handleAccept} disabled={isAccepting || isApproving} className="flex-1" data-testid="btn-accept-order">
                    {isApproving ? "Approving bond…" : isAccepting ? "Signing…" : "Accept order"}
                </Button>
                <button
                    type="button"
                    onClick={onDismiss}
                    disabled={isAccepting || isApproving}
                    className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                    data-testid="btn-dismiss-order"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

// ── Ready-to-submit card: fully signed, relayed to me as seller — my broadcast ──
// The dispatch race's last mile: the buyer signed my countersigned draft and
// relayed it back carrying BOTH signatures. Same approve-then-act shape as the
// accept card — being committed pulls my seller bond, so the allowance must
// cover it before broadcasting.
function ReadyToSubmitCard({ payload, onSubmit, onDismiss, isSubmitting, listings }: {
    payload: CommitmentPayload;
    onSubmit: () => void;
    onDismiss: () => void;
    isSubmitting: boolean;
    listings: ReadonlyArray<Listing>;
}) {
    const { commitment } = payload;
    const { address } = useAccount();
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const sellerBond = calculateBonds(commitment.expectedCumulativeValue, commitment.payment).sellerBond;
    const core = CONTRACTS.core as `0x${string}` | undefined;
    const { needsApproval, approve, isApprovePending, isApproveConfirming, isApproveSuccess } = useTokenApproval({
        tokenAddress: commitment.currency as `0x${string}`,
        owner: address,
        spender: (core ?? ZERO_ADDRESS) as `0x${string}`,
    });
    const { runWithApproval } = useApproveThenAct({ needsApproval, approve, isApproveSuccess });
    const isApproving = isApprovePending || isApproveConfirming;
    const handleSubmit = () => runWithApproval(sellerBond, onSubmit);

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4" data-testid="order-ready-to-submit-card">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-500 mb-1">Fully signed — submit on-chain</p>
                    <p className="text-sm font-mono text-neutral-700">
                        From {displayNameForAddress(listings, commitment.buyer)}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Order value</p>
                    <p className="text-sm font-semibold text-black">{formatToken(commitment.payment, decimals)}</p>
                </div>
            </div>
            <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600 space-y-1">
                <p>
                    <span className="font-medium text-neutral-700">Your seller bond:</span>{" "}
                    {formatToken(sellerBond, decimals)}
                    <span className="text-neutral-400 ml-1">(locked at submit, returned at settlement)</span>
                </p>
            </div>
            <div className="flex gap-2">
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isApproving} className="flex-1" data-testid="btn-submit-ready-order">
                    {isApproving ? "Approving bond…" : isSubmitting ? "Submitting…" : "Submit on-chain"}
                </Button>
                <button
                    type="button"
                    onClick={onDismiss}
                    disabled={isSubmitting || isApproving}
                    className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                    data-testid="btn-dismiss-ready-order"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

// ── Outbound pending row: I signed and relayed, awaiting the counterparty ──
function AwaitingAcceptanceRow({ payload, listings }: { payload: CommitmentPayload; listings: ReadonlyArray<Listing> }) {
    const { commitment } = payload;
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const counterpartyName = displayNameForAddress(listings, commitment.seller);
    return (
        <div className="block rounded-lg border border-neutral-200 bg-white p-4" data-testid="order-pending-row">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-sm font-semibold text-black truncate">{counterpartyName}</h2>
                        <span
                            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
                            data-testid="order-pending-status"
                        >
                            Awaiting acceptance
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">Waiting for {counterpartyName} to counter-sign.</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Order value</p>
                    <p className="text-sm font-semibold text-black">{formatToken(commitment.payment, decimals)}</p>
                </div>
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
            className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-black transition-colors"
            data-testid={`order-row-${row.processId}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-sm font-semibold text-black truncate">
                            {displayNameForAddress(listings, row.counterparty)}
                        </h2>
                        <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                row.isResolved
                                    ? "border-green-200 bg-green-50 text-green-800"
                                    : "border-blue-200 bg-blue-50 text-blue-800"
                            }`}
                            data-testid={`order-status-${row.processId}`}
                        >
                            {row.isResolved ? "Completed" : "In progress"}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 font-mono">
                        Process {truncateHex(row.processId, { head: 10, tail: 6 })}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Order value</p>
                    <p className="text-sm font-semibold text-black">{formatToken(row.payment, decimals)}</p>
                </div>
            </div>
        </Link>
    );
}

export function OrdersList() {
    const { address, isConnected } = useAccount();
    const mounted = useMounted();
    const chainId = useChainId();
    const buyer = useWalletProcessRows("buyer");
    const seller = useWalletProcessRows("seller");
    const { listings } = useMemberListings();
    const isMock = isE2EMockSession();

    // Merge buyer + seller rows — the wallet sees every order it's on, deduped
    // by the committed order hash, newest first.
    const rows = useMemo(() => {
        const byHash = new Map<string, ProcessRow>();
        for (const r of [...buyer.rows, ...seller.rows]) {
            const key = r.rootOrderHash.toLowerCase();
            if (!byHash.has(key)) byHash.set(key, r);
        }
        return [...byHash.values()].sort((a, b) => b.blockNumber - a.blockNumber);
    }, [buyer.rows, seller.rows]);
    const isLoading = buyer.isLoading || seller.isLoading;

    // YOUR TURN — relayed commitments awaiting my counter-signature (accept).
    const { pending: incoming, dismiss: dismissIncoming } = usePendingSellerSignature(awaitsMyCounterSign);
    const { acceptOrder, commitOrder, error: flowError, reset, step: flowStep } = useOrderCommitmentFlow();
    const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
    const [acceptError, setAcceptError] = useState<string | null>(null);

    const handleAccept = useCallback(async (index: number) => {
        const payload = incoming[index];
        if (!payload) return;
        // Layer A (agreement-hash recompute) is enforced inside the flow's sign
        // step — acceptOrder throws on mismatch and the catch below surfaces it.
        setAcceptingIndex(index);
        setAcceptError(null);
        try {
            await acceptOrder(payload);
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

    const handleSubmitReady = useCallback(async (index: number) => {
        const payload = readyToSubmit[index];
        if (!payload) return;
        setSubmittingIndex(index);
        setSubmitError(null);
        try {
            await commitOrder(payload);
            dismissReady(index);
            reset();
        } catch (cause: unknown) {
            setSubmitError(extractErrorMessage(cause, "Submit failed"));
        } finally {
            setSubmittingIndex(null);
        }
    }, [readyToSubmit, commitOrder, dismissReady, reset]);

    // AWAITING ACCEPTANCE — commitments I relayed, waiting on the counterparty.
    const { pending: outbound } = usePendingSellerSignature(awaitsCounterpartySignature);

    // A relayed payload still reads single-sig after commit; hide any pending
    // (either direction) whose order is already on-chain in `rows`.
    const core = CONTRACTS.core as `0x${string}` | undefined;
    const committedHashes = new Set(rows.map((r) => r.rootOrderHash.toLowerCase()));
    const notCommitted = (payload: CommitmentPayload) => {
        if (!chainId || !core) return true;
        try {
            return !committedHashes.has(computeOrderHash(payload.commitment, chainId, core).toLowerCase());
        } catch {
            return true;
        }
    };
    const visibleIncoming = incoming
        .map((payload, index) => ({ payload, index }))
        .filter(({ payload }) => notCommitted(payload));
    const visibleOutbound = address && core ? outbound.filter(notCommitted) : outbound;
    const visibleReady = readyToSubmit
        .map((payload, index) => ({ payload, index }))
        .filter(({ payload }) => notCommitted(payload));

    const activeRows = rows.filter((r) => !r.isResolved);
    const completedRows = rows.filter((r) => r.isResolved);
    const nothing = !isLoading && rows.length === 0 && visibleIncoming.length === 0 && visibleOutbound.length === 0 && visibleReady.length === 0;

    return (
        <div data-testid="orders-list" className="container mx-auto px-6 py-10 max-w-3xl space-y-8">
            <header>
                <p className="text-xs font-semibold text-neutral-500">Your orders</p>
                <h1 className="mt-1 text-3xl font-bold text-black">Orders</h1>
                <p className="mt-2 text-sm text-neutral-600">
                    Every order you&apos;re on — buyer or seller — and anything that needs you.
                </p>
            </header>

            {/* Gate on mounted: the server renders the disconnected branch, so the
                first client render must too (wagmi restores the connection
                synchronously from storage — branching on it during hydration is
                React #418/#423/#425). Real state takes over post-mount. */}
            {!mounted || !isConnected ? (
                <WalletGate explainer={STRANGER_EXPLAINER} hint="Connect a wallet to see your orders.">
                    <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
                        Connect a wallet to see your orders.
                    </div>
                </WalletGate>
            ) : (
                <>
                    {!isMock && visibleIncoming.length > 0 && (
                        <section className="space-y-3" data-testid="orders-your-turn-section">
                            <p className="text-xs font-semibold text-neutral-500">Your turn</p>
                            <div className="space-y-3">
                                {visibleIncoming.map(({ payload, index }) => (
                                    <YourTurnCard
                                        key={index}
                                        payload={payload}
                                        onAccept={() => void handleAccept(index)}
                                        onDismiss={() => dismissIncoming(index)}
                                        isAccepting={acceptingIndex === index || flowStep === "signing" || flowStep === "committing"}
                                        listings={listings}
                                    />
                                ))}
                            </div>
                            {(acceptError ?? flowError) && (
                                <p className="text-sm text-red-600" data-testid="orders-your-turn-error">{acceptError ?? flowError}</p>
                            )}
                        </section>
                    )}

                    {!isMock && visibleReady.length > 0 && (
                        <section className="space-y-3" data-testid="orders-ready-section">
                            <p className="text-xs font-semibold text-neutral-500">Ready to submit</p>
                            <div className="space-y-3">
                                {visibleReady.map(({ payload, index }) => (
                                    <ReadyToSubmitCard
                                        key={`ready-${index}`}
                                        payload={payload}
                                        onSubmit={() => void handleSubmitReady(index)}
                                        onDismiss={() => dismissReady(index)}
                                        isSubmitting={submittingIndex === index}
                                        listings={listings}
                                    />
                                ))}
                            </div>
                            {submitError && (
                                <p className="text-sm text-red-600" data-testid="orders-ready-error">{submitError}</p>
                            )}
                        </section>
                    )}

                    {visibleOutbound.length > 0 && (
                        <section className="space-y-3" data-testid="orders-pending-section">
                            <p className="text-xs font-semibold text-neutral-500">Awaiting acceptance</p>
                            <ul className="space-y-3" data-testid="orders-pending">
                                {visibleOutbound.map((payload, index) => (
                                    <li key={`pending-${index}`}>
                                        <AwaitingAcceptanceRow payload={payload} listings={listings} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {nothing ? (
                        <div className="rounded-lg border border-neutral-200 bg-white p-6 space-y-3" data-testid="orders-empty">
                            <p className="text-sm text-neutral-700">You haven&apos;t placed or received any orders yet.</p>
                            <Link
                                href="/discover"
                                className="inline-block rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                data-testid="link-discover-from-orders-empty"
                            >
                                Browse sellers →
                            </Link>
                        </div>
                    ) : (
                        <>
                            <section className="space-y-3" data-testid="orders-active-section">
                                <p className="text-xs font-semibold text-neutral-500">In progress</p>
                                {isLoading ? (
                                    <p className="text-sm text-neutral-500" data-testid="orders-loading">Loading…</p>
                                ) : activeRows.length === 0 ? (
                                    <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500" data-testid="orders-active-empty">
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
                                    <p className="text-xs font-semibold text-neutral-500">Completed</p>
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
