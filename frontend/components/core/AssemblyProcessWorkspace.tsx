"use client";

import { useAccount } from "wagmi";
import { EconomicBreakdownPanel } from "@/components/core/EconomicBreakdownPanel";
import { OrderNodeSemanticCard } from "@/components/core/OrderNodeSemanticCard";
import { ProcessTopologyPanel } from "@/components/core/ProcessTopologyPanel";
import { SettlementProceedsPanel } from "@/components/core/SettlementProceedsPanel";
import { CapabilityExecutionInput, CapabilityModel, ProcessModel } from "@/lib/semantic/models";
import { hexEqual } from "@/lib/shared/evm";

interface Props {
    process: ProcessModel;
    executableCapabilityIds?: Set<string>;
    executingCapabilityId?: string | null;
    onExecuteCapability?: (capability: CapabilityModel, input?: CapabilityExecutionInput) => void | Promise<void>;
    selectedParentOrderIds?: Set<string>;
    onToggleParentSelection?: (orderId: string) => void;
    onComposeFromSelection?: (parentOrderIds: string[], currency?: `0x${string}`) => void;
    onSelectOrder?: (orderId: string) => void;
}

export function AssemblyProcessWorkspace({
    process,
    executableCapabilityIds,
    executingCapabilityId,
    onExecuteCapability,
    selectedParentOrderIds,
    onToggleParentSelection,
    onComposeFromSelection,
    onSelectOrder,
}: Props) {
    const { address } = useAccount();
    const isResolved = process.stateSummary.startsWith("Closed");
    const rootOrder = process.orders.find((o) => o.orderId === process.rootOrderId);

    return (
        <div className="space-y-4">
            {isResolved && rootOrder && address && (
                <SettlementProceedsPanel
                    sourceOrderId={rootOrder.orderId}
                    currency={rootOrder.currency ?? ("0x0" as `0x${string}`)}
                    isSeller={hexEqual(rootOrder.seller, address)}
                />
            )}
            {process.economicSummary && (
                <EconomicBreakdownPanel
                    title="Process Accounting"
                    breakdown={process.economicSummary}
                    currencyAddress={process.currency}
                />
            )}

            <ProcessTopologyPanel
                process={process}
                executableCapabilityIds={executableCapabilityIds}
                executingCapabilityId={executingCapabilityId}
                onExecuteCapability={onExecuteCapability}
                selectedParentOrderIds={selectedParentOrderIds}
                onToggleParentSelection={onToggleParentSelection}
                onComposeFromSelection={onComposeFromSelection}
                onSelectOrder={onSelectOrder}
            />

            <div>
                <p className="text-xs font-semibold text-neutral-500 mb-3">Process Workspace</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {process.orders.map((order) => (
                        <OrderNodeSemanticCard
                            key={order.orderId}
                            order={order}
                            executableCapabilityIds={executableCapabilityIds}
                            executingCapabilityId={executingCapabilityId}
                            onExecuteCapability={onExecuteCapability}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}