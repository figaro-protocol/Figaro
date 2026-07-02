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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { calculateBonds } from "@figaro/core";
import { formatToken } from "@/lib/shared/utils";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { Button } from "@/components/ui/Button";
import { WalletGate } from "@/components/core/WalletGate";
import { useWalletProcessRows, type ProcessRow } from "@/lib/kernel/walletProcessQueries";
import { useOrderCommitmentFlow } from "@/lib/checkout/orderCommitmentFlow";
import { type CommitmentPayload } from "@/lib/kernel/signedCommitment";
import { computeOrderHash, computeAgreementHash } from "@figaro/core";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CONTRACTS } from "@/lib/kernel/contracts";
import {
    usePendingSellerSignature,
    awaitsMyCounterSign,
    awaitsCounterpartySignature,
} from "@/lib/checkout/orderPendingSellerSignature";
import { useSellerListings } from "@/lib/seller/useSellerListings";
import { displayNameForAddress } from "@/lib/seller/sellerListing";
import type { Listing } from "@/lib/seller/sellerListing";
import { isE2EMockSession } from "@/lib/shared/e2e";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import useTokenApproval from "@/hooks/core/useTokenApproval";

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
    const pendingAccept = useRef(false);
    useEffect(() => {
        if (isApproveSuccess && pendingAccept.current) {
            pendingAccept.current = false;
            onAccept();
        }
    }, [isApproveSuccess, onAccept]);
    const isApproving = isApprovePending || isApproveConfirming;
    const handleAccept = () => {
        if (needsApproval(sellerBond)) {
            pendingAccept.current = true;
            approve(sellerBond * 10n);
        } else {
            onAccept();
        }
    };

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

// ── Outbound pending row: I signed and relayed, awaiting the counterparty ──
function AwaitingAcceptanceRow({ payload, listings }: { payload: CommitmentPayload; listings: ReadonlyArray<Listing> }) {
    const { commitment } = payload;
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
                    <p className="text-sm font-semibold text-black">{formatToken(commitment.payment)}</p>
                </div>
            </div>
        </div>
    );
}

// ── On-chain process row (the wallet is buyer or seller on it) ──
function OrderRow({ row, listings }: { row: ProcessRow; listings: ReadonlyArray<Listing> }) {
    return (
        <Link
            href={`/orders/${row.processId}`}
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
                    <p className="text-sm font-semibold text-black">{formatToken(row.payment)}</p>
                </div>
            </div>
        </Link>
    );
}

export function OrdersList() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const buyer = useWalletProcessRows("buyer");
    const seller = useWalletProcessRows("seller");
    const { listings } = useSellerListings();
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
    const { acceptOrder, error: flowError, reset, step: flowStep } = useOrderCommitmentFlow();
    const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
    const [acceptError, setAcceptError] = useState<string | null>(null);

    const handleAccept = useCallback(async (index: number) => {
        const payload = incoming[index];
        if (!payload) return;
        // Layer A — never counter-sign an agreement that doesn't match the hash
        // being signed. Recompute the relayed agreement's merkle root and confirm
        // it equals the commitment's agreementHash before committing.
        if (payload.agreement) {
            const recomputed = computeAgreementHash(payload.agreement);
            if (recomputed.toLowerCase() !== payload.commitment.agreementHash.toLowerCase()) {
                setAcceptError(
                    "This order isn't valid to commit: the agreement does not match its signed hash.",
                );
                return;
            }
        }
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

    const activeRows = rows.filter((r) => !r.isResolved);
    const completedRows = rows.filter((r) => r.isResolved);
    const nothing = !isLoading && rows.length === 0 && visibleIncoming.length === 0 && visibleOutbound.length === 0;

    return (
        <div data-testid="orders-list" className="container mx-auto px-6 py-10 max-w-3xl space-y-8">
            <header>
                <p className="text-xs font-semibold text-neutral-500">Your orders</p>
                <h1 className="mt-1 text-3xl font-bold text-black">Orders</h1>
                <p className="mt-2 text-sm text-neutral-600">
                    Every order you&apos;re on — buyer or seller — and anything that needs you.
                </p>
            </header>

            {!isConnected ? (
                <WalletGate hint="Connect a wallet to see your orders.">
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
