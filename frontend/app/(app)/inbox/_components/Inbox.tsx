"use client";

/**
 * Inbox — the per-wallet landing page rendered at `/inbox`. Actor-neutral
 * shell: the protocol is symmetric, so a buyer inbox is a future section
 * here, not a separate surface. Today it renders the seller-side sections;
 * the name stays neutral so buyer content lands without a rename.
 *
 *  1. **Pending orders** — XMTP-listened commitment payloads where the
 *     connected wallet is the seller. Lifted from `IncomingOrdersModule`'s
 *     subscribe pattern; same `accept` (counter-sign + broadcast) and
 *     `dismiss` semantics. Once accepted, the order moves to section 2.
 *
 *  2. **Active orders** — on-chain processes where the connected wallet
 *     is the rootSeller and the kernel state is Active. One row per
 *     process linking to `/orders/[processId]` (the per-order timeline
 *     from Increment 1).
 *
 *  3. **Completed orders** — same as (2) but resolved.
 *
 * Single dedicated page; assembly choice isn't relevant at inbox time
 * (the assembly is encoded in the buyer's commitment assemblyTemplate).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import { truncateHex } from "@/lib/shared/formatHex";
import { calculateBonds } from "@figaro/core";
import { Button } from "@/components/ui/Button";
import { WalletGate } from "@/components/core/WalletGate";
import { deserializePayload } from "@/components/core/CommitmentSharePanel";
import { useCommitmentFlow, type CommitmentPayload } from "@/lib/core/useCommitmentFlow";
import { validateCommitmentAgreement } from "@/lib/core/orderAgreement";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";
import { useWalletProcessRows, type ProcessRow } from "@/lib/core/walletProcessQueries";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { fetchCommitmentPayloadJsonByCid } from "@/lib/handoff/coordinationMessagingService";
import { useSellerListings } from "@/lib/mechanisms/useSellerListings";
import { displayNameForAddress } from "@/lib/shared/sellerListing";
import type { Listing } from "@/lib/shared/sellerListing";
import { isE2EMockSession } from "@/lib/shared/e2e";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";

// ── Pending order card ──────────────────────────────────────────────

interface PendingOrderCardProps {
    payload: CommitmentPayload;
    onAccept: () => void;
    onDismiss: () => void;
    isAccepting: boolean;
    listings: ReadonlyArray<Listing>;
}

function PendingOrderCard({ payload, onAccept, onDismiss, isAccepting, listings }: PendingOrderCardProps) {
    const { commitment } = payload;
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const sellerBond = calculateBonds(commitment.expectedCumulativeValue, commitment.payment).sellerBond;

    return (
        <div
            className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4"
            data-testid="inbox-pending-card"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-500 mb-1">
                        New order request
                    </p>
                    <p className="text-sm font-mono text-neutral-700">
                        From {displayNameForAddress(listings, commitment.buyer)}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Order value</p>
                    <p className="text-sm font-semibold text-black">
                        {formatToken(commitment.payment, decimals)}
                    </p>
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
                <Button
                    type="button"
                    onClick={onAccept}
                    disabled={isAccepting}
                    className="flex-1"
                    data-testid="btn-accept-order"
                >
                    {isAccepting ? "Signing…" : "Accept order"}
                </Button>
                <button
                    type="button"
                    onClick={onDismiss}
                    disabled={isAccepting}
                    className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                    data-testid="btn-dismiss-order"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

// ── Active order row ────────────────────────────────────────────────

function ActiveOrderRow({ row, listings }: { row: ProcessRow; listings: ReadonlyArray<Listing> }) {
    return (
        <Link
            href={`/orders/${row.processId}`}
            className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-black transition-colors"
            data-testid={`inbox-active-row-${row.processId}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-black truncate">
                        From {displayNameForAddress(listings, row.counterparty)}
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500 font-mono">
                        Process {truncateHex(row.processId, { head: 10, tail: 6 })}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Value</p>
                    <p className="text-sm font-semibold text-black">{formatToken(row.payment, 18)}</p>
                </div>
            </div>
        </Link>
    );
}

// ── Main inbox ──────────────────────────────────────────────────────

export function Inbox() {
    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const services = useRuntimeServices();
    const { rows, isLoading } = useWalletProcessRows("seller");
    const { listings } = useSellerListings();

    const { counterSign, broadcast, error: flowError, reset, step: flowStep } = useCommitmentFlow();

    const [pending, setPending] = useState<CommitmentPayload[]>([]);
    const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
    const [acceptError, setAcceptError] = useState<string | null>(null);

    const receivedOrderIds = useRef<Set<string>>(new Set());
    const subscribed = useRef(false);
    const isMock = isE2EMockSession();

    // Subscribe to incoming commitment payloads via XMTP / coordination layer.
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
                        // A pending card is a commitment awaiting THIS wallet's
                        // counter-sign: the wallet is a party, the OTHER party
                        // has signed, this wallet has not. Party-neutral — the
                        // usual direction is the seller counter-signing a
                        // buyer-initiated order; a seller-initiated order (the
                        // dutch-auction claim relays the courier's signature)
                        // reaches the BUYER's inbox the same way.
                        const isSeller = hexEqual(address, payload.commitment.seller);
                        const isBuyer = hexEqual(address, payload.commitment.buyer);
                        const awaitsMyCounterSign =
                            (isSeller && !!payload.buyerSig && !payload.sellerSig)
                            || (isBuyer && !!payload.sellerSig && !payload.buyerSig);
                        if (!awaitsMyCounterSign) return;
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

    const handleAccept = useCallback(async (index: number) => {
        const payload = pending[index];
        if (!payload) return;
        // Layer A — the seller does not counter-sign an invalid agreement. The
        // agreement arrived over the relay; confirm its merkle root matches the
        // hash in the commitment AND every present clause's content is valid
        // before committing. (The buyer ran the same check before signing.)
        if (payload.agreement) {
            const sellerCheck = validateCommitmentAgreement(
                payload.agreement,
                payload.commitment.agreementHash as `0x${string}`,
            );
            if (!sellerCheck.ok) {
                setAcceptError(
                    `This order isn't valid to commit: ${sellerCheck.issues
                        .map((i) => `${i.clause} ${i.path}: ${i.message}`)
                        .join("; ")}`,
                );
                return;
            }
        }
        setAcceptingIndex(index);
        setAcceptError(null);
        try {
            const signed = await counterSign(payload);
            await broadcast(signed);
            setPending((prev) => prev.filter((_, i) => i !== index));
            reset();
        } catch (cause: unknown) {
            setAcceptError(extractErrorMessage(cause, "Signing failed"));
        } finally {
            setAcceptingIndex(null);
        }
    }, [pending, counterSign, broadcast, reset]);

    const handleDismiss = useCallback((index: number) => {
        setPending((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const activeRows = rows.filter((row) => !row.isResolved);
    const completedRows = rows.filter((row) => row.isResolved);

    return (
        <div data-testid="inbox" className="container mx-auto px-6 py-10 max-w-3xl space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-black">Inbox</h1>
                <p className="mt-2 text-sm text-neutral-600">
                    Incoming orders awaiting acceptance, plus orders you&apos;re currently fulfilling.
                </p>
            </header>

            {!isConnected ? (
                <WalletGate hint="Connect a wallet to receive incoming orders.">
                    <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
                        Connect a wallet to receive incoming orders.
                    </div>
                </WalletGate>
            ) : (
                <>
                    {/* Pending */}
                    <section className="space-y-3" data-testid="inbox-pending-section">
                        <p className="text-xs font-semibold text-neutral-500">Awaiting acceptance</p>
                        {isMock ? (
                            <div
                                className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500"
                                data-testid="inbox-mock-notice"
                            >
                                <p className="font-medium text-neutral-700 mb-1">Mock mode active</p>
                                <p>Mock orders commit on-chain immediately and bypass the inbox.</p>
                            </div>
                        ) : pending.length === 0 ? (
                            <div
                                className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500"
                                data-testid="inbox-pending-empty"
                            >
                                <p className="font-medium text-neutral-700 mb-1">Listening for orders</p>
                                <p>When a buyer sends an order to your wallet, it will appear here for review.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pending.map((payload, index) => (
                                    <PendingOrderCard
                                        key={index}
                                        payload={payload}
                                        onAccept={() => void handleAccept(index)}
                                        onDismiss={() => handleDismiss(index)}
                                        isAccepting={acceptingIndex === index || flowStep === "signing" || flowStep === "broadcasting"}
                                        listings={listings}
                                    />
                                ))}
                            </div>
                        )}
                        {(acceptError ?? flowError) && (
                            <p className="text-sm text-red-600" data-testid="inbox-pending-error">
                                {acceptError ?? flowError}
                            </p>
                        )}
                    </section>

                    {/* Active */}
                    <section className="space-y-3" data-testid="inbox-active-section">
                        <p className="text-xs font-semibold text-neutral-500">In progress</p>
                        {isLoading ? (
                            <p className="text-sm text-neutral-500" data-testid="inbox-active-loading">Loading…</p>
                        ) : activeRows.length === 0 ? (
                            <div
                                className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500"
                                data-testid="inbox-active-empty"
                            >
                                No orders in progress.
                            </div>
                        ) : (
                            <ul className="space-y-3" data-testid="inbox-active-list">
                                {activeRows.map((row) => (
                                    <li key={row.processId}>
                                        <ActiveOrderRow row={row} listings={listings} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Completed */}
                    {completedRows.length > 0 && (
                        <section className="space-y-3" data-testid="inbox-completed-section">
                            <p className="text-xs font-semibold text-neutral-500">Completed</p>
                            <ul className="space-y-3" data-testid="inbox-completed-list">
                                {completedRows.map((row) => (
                                    <li key={row.processId}>
                                        <ActiveOrderRow row={row} listings={listings} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
