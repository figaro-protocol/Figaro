"use client";

import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { AssemblyProcessWorkspace } from "@/components/core/AssemblyProcessWorkspace";
import { SubOrderModal } from "@/components/core/SubOrderModal";
import { TransactionStatusBanner } from "@/components/core/TransactionStatusBanner";
import { useOrderStore } from "@/lib/core/store";
import { useSemanticProcessWorkspace } from "@/hooks/core/useSemanticProcessWorkspace";

export function SemanticProcessWorkspacePanel() {
    const { address } = useAccount();
    const viewedProcessId = useOrderStore((state) => state.viewedProcessId);
    const {
        effectiveProcessId,
        processModel,
        executableCapabilityIds,
        executingCapabilityId,
        activeActionLabel,
        actionError,
        isPending,
        isConfirming,
        isSuccess,
        mockIsSuccess,
        selectedParentOrderIds,
        subOrderParent,
        executeCapability,
        retryLastAction,
        isE2EMock,
        toggleParentSelection,
        openMultiParentComposer,
        closeSubOrderComposer,
    } = useSemanticProcessWorkspace({ processId: viewedProcessId });

    if (!effectiveProcessId || !processModel) {
        return null;
    }

    return (
        <>
            <Card className="p-4 mt-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-black">Institution Workspace</h3>
                        <p className="text-sm text-neutral-600">
                            Semantic process view for the selected live process, combining action, topology, accounting, and composition.
                        </p>
                    </div>
                    <span className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 font-mono">
                        {effectiveProcessId.slice(0, 12)}...
                    </span>
                </div>

                <TransactionStatusBanner
                    title="Workspace Status"
                    activeLabel={activeActionLabel}
                    isPending={isPending}
                    isConfirming={isConfirming}
                    isSuccess={isSuccess || mockIsSuccess}
                    errorMessage={actionError}
                    onRetry={actionError ? retryLastAction : undefined}
                />

                <div className="mt-4">
                    <AssemblyProcessWorkspace
                        process={processModel}
                        executableCapabilityIds={executableCapabilityIds}
                        executingCapabilityId={executingCapabilityId}
                        onExecuteCapability={executeCapability}
                        selectedParentOrderIds={selectedParentOrderIds}
                        onToggleParentSelection={toggleParentSelection}
                        onComposeFromSelection={openMultiParentComposer}
                    />
                </div>

                {isE2EMock && (
                    <p className="mt-3 text-xs text-neutral-500">
                        Mock-mode actions are routed through the assembly workspace for compatibility with the legacy home-flow tests.
                    </p>
                )}
            </Card>

            {effectiveProcessId && subOrderParent?.currency && subOrderParent.orderIds.length > 0 && (
                <SubOrderModal
                    processId={effectiveProcessId}
                    parentOrderId={subOrderParent.orderIds[0]}
                    defaultParentOrderIds={subOrderParent.orderIds}
                    defaultCurrency={subOrderParent.currency}
                    onClose={closeSubOrderComposer}
                />
            )}
        </>
    );
}