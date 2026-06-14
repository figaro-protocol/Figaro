"use client";

/**
 * BuyerOrdersList — landing page for the buyer surface, rendered at
 * `/orders`. One row per process the connected wallet initiated as the
 * rootBuyer; counterparty (merchant) display name resolved from the
 * runtime identity registry; status pill derived from the kernel
 * resolved state.
 *
 * Also surfaces OUTBOUND PENDING orders — commitments this wallet signed
 * and relayed over the coordination channel that the seller has not yet
 * counter-signed (so they are not on-chain). They are read off the channel
 * (the source of truth), deduped against committed rows by order hash, and
 * shown read-only above the committed list. Without this, an in-flight
 * order is invisible the moment the buyer leaves the share panel.
 *
 * Replaces the prior "Wallet Processes" sidebar in the assembly runtime
 * (which mixed buyer + seller roles in one list and buried order
 * navigation behind a sidebar click). The /orders page is the consumer's
 * single source of truth for "what orders have I placed".
 */

import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import { truncateHex } from "@/lib/shared/formatHex";
import { WalletGate } from "@/components/core/WalletGate";
import { useWalletProcessRows } from "@/lib/core/walletProcessQueries";
import { computeOrderHash } from "@/lib/core/commitmentStore";
import { CONTRACTS } from "@/lib/core/contracts";
import { usePendingCommitments, awaitsCounterpartySignature } from "@/hooks/core/usePendingCommitments";
import type { CommitmentPayload } from "@/lib/core/useCommitmentFlow";
import { useSellerListings } from "@/lib/mechanisms/useSellerListings";
import { displayNameForAddress } from "@/lib/shared/sellerListing";
import type { Listing } from "@/lib/shared/sellerListing";

// ── Outbound pending row ────────────────────────────────────────────
// An order this wallet signed and relayed, awaiting the seller's
// counter-signature — not yet on-chain, so it links nowhere (no process
// page exists until commit). Read-only; it migrates to a committed row
// once the seller counter-signs and broadcasts.
function PendingOutboundRow({ payload, listings }: { payload: CommitmentPayload; listings: ReadonlyArray<Listing> }) {
    const { commitment } = payload;
    const sellerName = displayNameForAddress(listings, commitment.seller);
    return (
        <div
            className="block rounded-lg border border-neutral-200 bg-white p-4"
            data-testid="buyer-order-pending-row"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-sm font-semibold text-black truncate">
                            {sellerName}
                        </h2>
                        <span
                            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
                            data-testid="buyer-order-pending-status"
                        >
                            Awaiting acceptance
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                        Waiting for {sellerName} to counter-sign.
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Order value</p>
                    <p className="text-sm font-semibold text-black">
                        {formatToken(commitment.payment)}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function BuyerOrdersList() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { rows, isLoading } = useWalletProcessRows("buyer");
    const { listings } = useSellerListings();
    const { pending } = usePendingCommitments(awaitsCounterpartySignature);

    // Hide any pending order already committed on-chain: the kernel emits
    // OrderCommitted once the seller counter-signs + broadcasts, at which
    // point the committed row below covers it. Dedup by the canonical order
    // hash (the mock channel's callback orderId is synthetic, so derive it
    // from the commitment, never trust the arg).
    const core = CONTRACTS.core as `0x${string}` | undefined;
    const committedHashes = new Set(rows.map((r) => r.rootOrderHash.toLowerCase()));
    const pendingOutbound = address && chainId && core
        ? pending.filter((p) => {
            try {
                return !committedHashes.has(
                    computeOrderHash(p.commitment, chainId, core).toLowerCase(),
                );
            } catch {
                return true;
            }
        })
        : pending;

    return (
        <div data-testid="buyer-orders-list" className="container mx-auto px-6 py-10 max-w-3xl space-y-6">
            <header>
                <p className="text-xs font-semibold text-neutral-500">Your orders</p>
                <h1 className="mt-1 text-3xl font-bold text-black">Orders</h1>
                <p className="mt-2 text-sm text-neutral-600">
                    Every order you&apos;ve placed, active or settled.
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
                    {pendingOutbound.length > 0 && (
                        <section className="space-y-3" data-testid="buyer-orders-pending-section">
                            <p className="text-xs font-semibold text-neutral-500">Awaiting acceptance</p>
                            <ul className="space-y-3" data-testid="buyer-orders-pending">
                                {pendingOutbound.map((payload, index) => (
                                    <li key={`pending-${index}`}>
                                        <PendingOutboundRow payload={payload} listings={listings} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {isLoading ? (
                        <p className="text-sm text-neutral-500" data-testid="buyer-orders-loading">Loading…</p>
                    ) : rows.length === 0 && pendingOutbound.length === 0 ? (
                        <div className="rounded-lg border border-neutral-200 bg-white p-6 space-y-3" data-testid="buyer-orders-empty">
                            <p className="text-sm text-neutral-700">You haven&apos;t placed any orders yet.</p>
                            <Link
                                href="/discover"
                                className="inline-block rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                data-testid="link-discover-from-orders-empty"
                            >
                                Browse merchants →
                            </Link>
                        </div>
                    ) : rows.length > 0 ? (
                        <ul className="space-y-3" data-testid="buyer-orders">
                            {rows.map((row) => (
                                <li key={row.processId}>
                                    <Link
                                        href={`/orders/${row.processId}`}
                                        className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-black transition-colors"
                                        data-testid={`buyer-order-row-${row.processId}`}
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
                                                        data-testid={`buyer-order-status-${row.processId}`}
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
                                                <p className="text-sm font-semibold text-black">
                                                    {formatToken(row.payment)}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </>
            )}
        </div>
    );
}
