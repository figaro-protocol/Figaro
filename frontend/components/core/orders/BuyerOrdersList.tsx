"use client";

/**
 * BuyerOrdersList — landing page for the buyer surface, rendered at
 * `/orders`. One row per process the connected wallet initiated as the
 * rootBuyer; counterparty (merchant) display name resolved from the
 * runtime identity registry; status pill derived from the kernel
 * resolved state.
 *
 * Replaces the prior "Wallet Processes" sidebar in the assembly runtime
 * (which mixed buyer + seller roles in one list and buried order
 * navigation behind a sidebar click). The /orders page is the consumer's
 * single source of truth for "what orders have I placed".
 */

import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { WalletGate } from "@/components/core/WalletGate";
import { useWalletProcessRows } from "@/lib/core/walletProcessQueries";
import { resolveRuntimeSubjectByAddress } from "@/lib/shared/runtimeIdentityRegistry";
import { truncateHex } from "@/lib/shared/formatHex";

function formatAddress(addr: string): string {
    return truncateHex(addr);
}

function counterpartyDisplayName(address: string): string {
    if (!address.startsWith("0x")) return address;
    const subject = resolveRuntimeSubjectByAddress(address as `0x${string}`);
    return subject?.subject?.displayName ?? formatAddress(address);
}

export function BuyerOrdersList() {
    const { isConnected } = useAccount();
    const { rows, isLoading } = useWalletProcessRows("buyer");

    return (
        <div data-testid="buyer-orders-list" className="container mx-auto px-6 py-10 max-w-3xl space-y-6">
            <header>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Your orders</p>
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
            ) : isLoading ? (
                <p className="text-sm text-neutral-500" data-testid="buyer-orders-loading">Loading…</p>
            ) : rows.length === 0 ? (
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
            ) : (
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
                                                {counterpartyDisplayName(row.counterparty)}
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
                                            Process {row.processId.slice(0, 10)}…{row.processId.slice(-6)}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs text-neutral-500">Order value</p>
                                        <p className="text-sm font-semibold text-black">
                                            {formatUnits(row.payment, 18)}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
