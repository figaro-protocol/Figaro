import { memo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Copy, Check } from "lucide-react";
import { EconomicBreakdownPanel } from "@/components/core/EconomicBreakdownPanel";
import { DisputeStatusPanel } from "@/components/core/DisputeStatusPanel";
import { useArbitrationCost } from "@/hooks/core/useArbitrationCost";
import { useAccount } from "wagmi";
import { useMemo } from "react";
import { CapabilityExecutionInput, CapabilityModel, OrderNodeModel } from "@/lib/semantic/models";
import { formatUnits } from "viem";
import { createDeliveryCoordinatorSource } from "@/lib/mechanisms/deliveryCoordinatorEvents";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { calculateBonds } from "@figaro/core";

function capabilityTestId(capability: CapabilityModel): string | undefined {
    if (capability.action.executionType === "runtime" && capability.action.kind === "open-sub-order-composer") {
        return capability.action.parentOrderIds.length === 1
            ? `btn-add-suborder-${capability.action.parentOrderIds[0]}`
            : undefined;
    }
    if (capability.action.executionType === "prototype" && capability.action.kind === "accept-offer") {
        return `btn-accept-${capability.scopeId}`;
    }
    if (capability.action.executionType === "prototype" && capability.action.kind === "cancel-offer") {
        return `btn-cancel-${capability.scopeId}`;
    }
    return undefined;
}

function capabilityButtonLabel(capability: CapabilityModel): string {
    if (capability.action.executionType === "prototype" && capability.action.kind === "accept-offer") return "Accept";
    if (capability.action.executionType === "prototype" && capability.action.kind === "cancel-offer") return "Cancel";
    return capability.label;
}

interface Props {
    order: OrderNodeModel;
    executableCapabilityIds?: Set<string>;
    executingCapabilityId?: string | null;
    onExecuteCapability?: (capability: CapabilityModel, input?: CapabilityExecutionInput) => void | Promise<void>;
}

export const OrderNodeSemanticCard = memo(function OrderNodeSemanticCard({
    order,
    executableCapabilityIds,
    executingCapabilityId,
    onExecuteCapability,
}: Props) {
    const { costEth, cost: arbCostWei, klerosConfig } = useArbitrationCost();
    const { address } = useAccount();

    // Stable coordinator event sources for extended dispute timelines
    const coordinatorSources = useMemo(() => [createDeliveryCoordinatorSource()], []);

    // Process orders for audit-bundle Kleros evidence. Sourced here (not
    // upstream) because this card is the only mount point for
    // DisputeStatusPanel today; lifting it would require threading orders
    // through every assembly shell.
    const processOrders = useProcessOrders(order.processId);

    // Buyer bond = 2× payment. Show dispute cost as % of buyer bond exposure
    // when both values are available. Note: bond is in ERC-20, arb cost is in
    // native currency — the percentage is cross-denomination (informational).
    const buyerBondWei = calculateBonds(order.payment, order.payment).buyerBond;
    const arbPctOfBond = arbCostWei && buyerBondWei > 0n
        ? ((Number(arbCostWei) / Number(buyerBondWei)) * 100).toFixed(1)
        : null;

    const [copiedId, setCopiedId] = useState(false);

    const copyProcessId = () => {
        navigator.clipboard.writeText(order.processId).then(() => {
            setCopiedId(true);
            setTimeout(() => setCopiedId(false), 1500);
        });
    };

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                    <p className="text-sm font-semibold text-black">Order #{order.orderId}</p>
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-500 font-mono">
                        {order.processId.slice(0, 12)}…
                        <button
                            type="button"
                            onClick={copyProcessId}
                            className="p-0.5 hover:text-black transition-colors"
                            aria-label="Copy process ID"
                            title="Copy full process ID"
                        >
                            {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                        {order.state}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                    <p className="text-neutral-500 text-xs">Buyer</p>
                    <p className="font-mono text-black truncate">{order.buyer}</p>
                </div>
                <div>
                    <p className="text-neutral-500 text-xs">Seller</p>
                    <p className="font-mono text-black truncate">{order.seller}</p>
                </div>
                <div>
                    <p className="text-neutral-500 text-xs">Payment</p>
                    <p className="text-black">{formatUnits(order.payment, 18)}</p>
                </div>
                <div>
                    <p className="text-neutral-500 text-xs">Capabilities</p>
                    <p className="text-black">{order.capabilities.length}</p>
                </div>
                <div>
                    <p className="text-neutral-500 text-xs">Parents</p>
                    <p className="text-black">{order.parentOrderIds.length}</p>
                </div>
                {costEth && (
                    <div data-testid="dispute-cost-card">
                        <p className="text-neutral-500 text-xs">Dispute Cost</p>
                        <p className="text-black">{costEth} ETH</p>
                        {arbPctOfBond && (
                            <p className="text-xs text-neutral-500">
                                {arbPctOfBond}% of bond · flat fee
                            </p>
                        )}
                    </div>
                )}
            </div>

            {order.parentOrderIds.length > 0 && (
                <div className="mb-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1">Depends On</p>
                    <p className="text-xs font-mono text-neutral-700 break-all">{order.parentOrderIds.join(", ")}</p>
                </div>
            )}

            {order.attachments.length > 0 && (
                <div className="mb-3 rounded border border-neutral-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Runtime Semantics</p>
                    <div className="flex flex-wrap gap-2">
                        {order.attachments.filter((attachment) => attachment.visibleByDefault).map((attachment) => (
                            <span
                                key={attachment.id}
                                title={attachment.description ?? attachment.label}
                                className="rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-[11px] text-neutral-700"
                            >
                                {attachment.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {order.capabilities.length > 0 && (
                <div className="border-t border-neutral-200 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Derived Actions</p>
                    <div className="space-y-2">
                        {order.capabilities.map((capability) => (
                            <div key={capability.id} className="flex items-center justify-between gap-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2">
                                <div>
                                    <p className="text-xs font-semibold text-black">{capability.label}</p>
                                    <p className="text-[11px] text-neutral-500">{capability.source.sourceLabel}</p>
                                </div>
                                {onExecuteCapability ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        data-testid={capabilityTestId(capability)}
                                        disabled={!executableCapabilityIds?.has(capability.id) || !!executingCapabilityId}
                                        onClick={() => onExecuteCapability(capability)}
                                    >
                                        {executingCapabilityId === capability.id ? "Processing..." : capabilityButtonLabel(capability)}
                                    </Button>
                                ) : (
                                    <span className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                                        {capability.label}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {order.settlementBreakdown && (
                <div className="mt-4">
                    <EconomicBreakdownPanel
                        title={`Order #${order.orderId} Accounting`}
                        breakdown={order.settlementBreakdown}
                        currencyAddress={order.currency}
                    />
                </div>
            )}

            <div className="mt-4" data-testid="dispute-status-panel">
                <DisputeStatusPanel
                    processId={order.processId as `0x${string}`}
                    klerosConfig={klerosConfig ?? undefined}
                    role={address && address.toLowerCase() === order.seller.toLowerCase() ? "seller" : "buyer"}
                    coordinatorSources={coordinatorSources}
                    orders={processOrders}
                />
            </div>
        </Card>
    );
});