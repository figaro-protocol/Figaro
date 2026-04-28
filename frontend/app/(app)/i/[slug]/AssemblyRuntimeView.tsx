"use client";

import { useMemo } from "react";
import { WalletGate } from "@/components/core/WalletGate";
import { AssemblyShell } from "@/components/core/AssemblyShell";
import { MerchantBrandingModule } from "@/components/modules/MerchantBrandingModule";
import { ProcessSummaryCard } from "@/components/core/ProcessSummaryCard";
import { SubOrderModal } from "@/components/core/SubOrderModal";
import { TransactionStatusBanner } from "@/components/core/TransactionStatusBanner";
import { getModule } from "@/lib/shared/moduleRegistry";
import { RuntimeServicesProvider } from "@/lib/shared/runtimeServicesContext";
import { resolveAssemblyRuntimeContext } from "@/lib/shared/runtimeResolution";
import { FIXTURE_RUNTIME_IDENTITY_SOURCE } from "@/lib/shared/runtimeIdentityRegistry";
import type { RegisteredAssembly } from "@/lib/shared/assemblyRegistry";
import type { ProcessModel } from "@/lib/semantic/models";
import { useAssemblyRuntime } from "@/hooks/core/useAssemblyRuntime";

interface Props {
    artifact: RegisteredAssembly;
    slug: string;
}

function buildFallbackProcessModel(processId: string, orderCount: number, hasActive: boolean): ProcessModel {
    return {
        processId,
        rootOrderId: "",
        currency: undefined,
        orders: [],
        relations: [],
        stateSummary: hasActive ? `Active · ${orderCount} total` : `Closed · ${orderCount} total`,
        capabilities: [],
        economicSummary: undefined,
        attachments: [],
        upstreamLinks: [],
        downstreamLinks: [],
    };
}

export function AssemblyRuntimeView({ artifact, slug }: Props) {
    const runtimeContext = useMemo(
        () => resolveAssemblyRuntimeContext(slug, "local-anvil", FIXTURE_RUNTIME_IDENTITY_SOURCE),
        [slug],
    );

    const runtime = useAssemblyRuntime(artifact, runtimeContext);
    const {
        context,
        sidebarBindings,
        mainBindings,
        walletProcesses,
        selectedProcessId,
        onSelectProcess,
        transactionStatus,
        subOrder,
    } = runtime;

    const renderBindings = (bindings: typeof sidebarBindings) =>
        bindings.map((binding) => {
            const Component = getModule(binding.moduleId);
            if (!Component) return null;
            return (
                <Component
                    key={binding.moduleId}
                    moduleId={binding.moduleId}
                    binding={binding}
                    context={context}
                />
            );
        });

    return (
        <div data-testid="assembly-runtime">
            <RuntimeServicesProvider services={context.services}>
                <MerchantBrandingModule
                    sellerAddress={context.selectedBoundSubject?.subjectAddress}
                    brandingOverride={context.skinBundle?.branding ?? null}
                    dataSkinId={context.skinBundle?.skinId}
                >
                    <AssemblyShell
                        title={context.shellPresentation.title}
                        subtitle={context.shellPresentation.subtitle}
                        skin={context.skinBundle}
                        sidebar={
                            <>
                                {renderBindings(sidebarBindings)}
                                <TransactionStatusBanner
                                    title="Transaction Status"
                                    activeLabel={transactionStatus.activeLabel}
                                    isPending={transactionStatus.isPending}
                                    isConfirming={transactionStatus.isConfirming}
                                    isSuccess={transactionStatus.isSuccess}
                                    errorMessage={transactionStatus.errorMessage}
                                />
                                <div className="space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                                        Wallet Processes
                                    </p>
                                    {walletProcesses.length > 0 ? (
                                        walletProcesses.map((summary) => (
                                            <ProcessSummaryCard
                                                key={summary.processId}
                                                process={
                                                    context.processModel?.processId === summary.processId
                                                        ? context.processModel
                                                        : buildFallbackProcessModel(
                                                            summary.processId,
                                                            summary.orderCount,
                                                            summary.hasActive,
                                                        )
                                                }
                                                orderCount={summary.orderCount}
                                                selected={summary.processId === selectedProcessId}
                                                onSelect={() => onSelectProcess(summary.processId)}
                                                skin={context.skinBundle}
                                            />
                                        ))
                                    ) : (
                                        <WalletGate hint="Connect a wallet to place orders and track active processes.">
                                            <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">No active processes found for this wallet.</p>
                                        </WalletGate>
                                    )}
                                </div>
                            </>
                        }
                        main={<>{renderBindings(mainBindings)}</>}
                    />
                </MerchantBrandingModule>

                {subOrder.effectiveProcessId && subOrder.parent?.currency && subOrder.parent.orderIds.length > 0 && (
                    <SubOrderModal
                        processId={subOrder.effectiveProcessId}
                        parentOrderId={subOrder.parent.orderIds[0]}
                        defaultParentOrderIds={subOrder.parent.orderIds}
                        defaultCurrency={subOrder.parent.currency}
                        onClose={subOrder.close}
                    />
                )}
            </RuntimeServicesProvider>
        </div>
    );
}
