"use client";

import { useMemo } from "react";
import { formatToken } from "@/lib/shared/utils";
import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { useDutchAuction, AuctionOrder } from "@/lib/mechanisms/useDutchAuction";
import { isClaimAuctionCapability } from "@/lib/semantic/models";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { truncateHex } from "@/lib/shared/formatHex";

function AuctionLiveStatePanel({
    context,
    order,
    accentTone,
}: {
    context: ModuleProps["context"];
    order: AuctionOrder;
    accentTone?: string;
}) {
    const auction = useDutchAuction(order);
    const claimCapability = context.selectedOrder?.capabilities.find(
        (capability) => isClaimAuctionCapability(capability) && capability.action.auctionId === order.id,
    );
    const isClaimExecutable = !!claimCapability && context.executableCapabilityIds.has(claimCapability.id);
    const isClaimExecuting = !!claimCapability && context.executingCapabilityId === claimCapability.id;
    const labelStyle = accentTone ? { color: accentTone } : undefined;

    if (!auction.connected) {
        return <p className="text-sm text-neutral-500">Connect a wallet to interact with this auction.</p>;
    }

    return (
        <div className="space-y-3" data-testid={`auction-live-state-${order.id}`}>
            {/* Live price / status */}
            <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <p className="text-xs text-neutral-500">Status</p>
                    <p className="font-semibold text-black" data-testid={`auction-status-${order.id}`}>
                        {auction.isClaimed ? "Claimed" : auction.started ? "Live" : "Not started"}
                    </p>
                </div>
                {auction.started && !auction.isClaimed && auction.currentPrice !== undefined && (
                    <div>
                        <p className="text-xs text-neutral-500">Current Price</p>
                        <p className="font-mono font-semibold text-black" style={labelStyle}>{formatToken(auction.currentPrice, context.tokenDecimals ?? 18)}</p>
                    </div>
                )}
                {auction.isClaimed && auction.assignedProvider && (
                    <div>
                        <p className="text-xs text-neutral-500">Assigned Provider</p>
                        <p className="font-mono text-xs text-black">
                            {truncateHex(auction.assignedProvider)}
                        </p>
                    </div>
                )}
                {auction.isClaimed && auction.clearingPrice !== undefined && (
                    <div>
                        <p className="text-xs text-neutral-500">Clearing Price</p>
                        <p className="font-mono font-semibold text-black" style={labelStyle}>{formatToken(auction.clearingPrice, context.tokenDecimals ?? 18)}</p>
                    </div>
                )}
            </div>

            {/* Claim button — no approval needed, auction has no token handling */}
            {auction.started && !auction.isClaimed && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        data-testid={`btn-claim-job-${order.id}`}
                        disabled={!isClaimExecutable || !!context.executingCapabilityId || auction.isPending || auction.isConfirming}
                        onClick={() => {
                            if (claimCapability) {
                                void context.onExecuteCapability(claimCapability);
                            }
                        }}
                        className="rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={isClaimExecutable && !context.executingCapabilityId && accentTone
                            ? {
                                backgroundColor: accentTone,
                                borderColor: accentTone,
                                color: "#ffffff",
                            }
                            : undefined}
                    >
                        {isClaimExecuting || auction.isPending || auction.isConfirming ? "Claiming..." : "Claim Job"}
                    </button>
                </div>
            )}
        </div>
    );
}

export function AuctionActionModule({ context }: ModuleProps) {
    const auctionMechanism = context.mechanisms.find((m) => m.kind === "auction");
    const { accentTone, shellLabel, cardStyle, labelStyle } = deriveModuleChrome(context);

    // Derive the auction order from the selected order
    const auctionOrder = useMemo((): AuctionOrder | null => {
        const order = context.selectedOrder;
        if (!order || !order.currency) return null;
        return {
            id: order.orderId,
            currency: order.currency,
            payment: order.payment,
        };
    }, [context.selectedOrder]);

    if (!auctionMechanism) {
        return null;
    }

    return (
        <div
            data-testid="auction-action-module"
            data-skin={context.skinBundle?.skinId}
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500" style={labelStyle}>
                {shellLabel}
            </p>
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    {auctionMechanism.name}
                </p>
                <span className="rounded border border-amber-400 px-2 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50">
                    {auctionMechanism.riskClass}
                </span>
            </div>

            {auctionOrder ? (
                <AuctionLiveStatePanel context={context} order={auctionOrder} accentTone={accentTone} />
            ) : (
                <p className="text-sm text-neutral-500">
                    Select a delivery order to view live auction state.
                </p>
            )}
        </div>
    );
}
