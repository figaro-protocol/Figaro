"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AssemblyShell } from "@/components/core/AssemblyShell";
import { MerchantBrandingModule } from "@/components/modules/MerchantBrandingModule";
import { ProcessSummaryCard } from "@/components/core/ProcessSummaryCard";
import { SubOrderModal } from "@/components/core/SubOrderModal";
import { TransactionStatusBanner } from "@/components/core/TransactionStatusBanner";
import { useWalletProcessIds } from "@/hooks/core/useWalletProcessIds";
import { useSemanticProcessWorkspace } from "@/hooks/core/useSemanticProcessWorkspace";
import { useOperatorProfile } from "@/lib/mechanisms/useOperatorRegistry";
import { deriveInstitutionCapabilitiesFromRuntime } from "@/lib/semantic/deriveInstitutionCapabilitiesFromRuntime";
import { deriveSelectedOrderCapabilitiesFromRuntime } from "@/lib/semantic/deriveSelectedOrderCapabilitiesFromRuntime";
import { ProcessModel } from "@/lib/semantic/models";
import { RegisteredInstitutionArtifact } from "@/lib/shared/institutionAssemblyRegistry";
import {
    ResolvedAssemblyRuntimeContext,
    resolveInstitutionSkinBundleFromTransport,
    resolveInstitutionSkinBundle,
    resolveInstitutionShellPresentation,
    resolveRoleScopedModuleSelection,
    resolveRoleScopedMechanismSelection,
    resolveRuntimeRoleSelection,
} from "@/lib/shared/runtimeResolution";
import { getModule, ModuleRenderContext } from "@/lib/shared/moduleRegistry";
import { resolveRuntimeServices } from "@/lib/shared/runtimeServices";
import { RuntimeServicesProvider } from "@/lib/shared/runtimeServicesContext";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";

interface Props {
    artifact: RegisteredInstitutionArtifact;
    runtimeContext?: ResolvedAssemblyRuntimeContext;
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

export function AssemblyWorkspace({ artifact, runtimeContext }: Props) {
    const { address } = useAccount();
    const { data: operatorProfile } = useOperatorProfile(address as `0x${string}` | undefined);
    const { assembly, model: institutionModel, riskBoundaries } = artifact;
    const roleContexts = institutionModel.roles;
    const runtimeRoleSelection = resolveRuntimeRoleSelection(address, runtimeContext?.boundSubjects ?? [], roleContexts);
    const selectedBoundSubject = runtimeRoleSelection.matchedSubject;
    const selectableRoles = runtimeRoleSelection.availableRoles;
    const [selectedRoleKind, setSelectedRoleKind] = useState(roleContexts[0]?.roleKind ?? "");
    const walletProcesses = useWalletProcessIds(address);
    const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const urlInitRef = useRef(false);
    useEffect(() => {
        if (urlInitRef.current) return;
        const urlProcessId = searchParams.get("processId");
        if (urlProcessId) {
            setSelectedProcessId(urlProcessId);
            urlInitRef.current = true;
        }
    }, [searchParams]);

    const handleSelectProcess = (processId: string) => {
        setSelectedProcessId(processId);
        setSelectedOrderId(null);
        const params = new URLSearchParams(searchParams.toString());
        params.set("processId", processId);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const effectiveProcessId = selectedProcessId ?? walletProcesses[0]?.processId ?? null;
    const {
        processModel,
        runtimeCapabilities,
        executingCapabilityId,
        activeActionLabel,
        actionError,
        isPending,
        isConfirming,
        isSuccess,
        mockIsSuccess,
        subOrderParent,
        executeCapability,
        openSubOrderComposer,
        closeSubOrderComposer,
    } = useSemanticProcessWorkspace({ processId: effectiveProcessId });

    useEffect(() => {
        if (!selectableRoles.some((role) => role.roleKind === selectedRoleKind)) {
            setSelectedRoleKind(runtimeRoleSelection.preferredRoleKind ?? selectableRoles[0]?.roleKind ?? "");
        }
    }, [runtimeRoleSelection.preferredRoleKind, selectableRoles, selectedRoleKind]);

    const selectedRole = selectableRoles.find((role) => role.roleKind === selectedRoleKind) ?? selectableRoles[0];

    // Each role has its own view — flip on role selection
    const activeViewId = selectedRole?.defaultLandingView ?? "buyer-view";
    const selectedViews = assembly.views.filter((view) => view.viewId === activeViewId);
    const selectedViewModuleIds = selectedViews.flatMap((view) => view.moduleSlots);

    const roleScopedMechanisms = resolveRoleScopedMechanismSelection(selectedRole, institutionModel.mechanisms);
    const roleScopedModules = resolveRoleScopedModuleSelection(selectedViewModuleIds, roleScopedMechanisms.visibleMechanisms);
    const visibleModuleIds = new Set(roleScopedModules.visibleModuleIds);

    const institutionRuntimeCapabilities = useMemo(
        () => deriveInstitutionCapabilitiesFromRuntime(
            assembly.identity.id,
            selectedRole?.roleKind,
            roleScopedMechanisms.visibleMechanisms,
            operatorProfile,
        ),
        [assembly.identity.id, selectedRole?.roleKind, roleScopedMechanisms.visibleMechanisms, operatorProfile],
    );
    const selectedOrder = useMemo(() => {
        if (!selectedOrderId || !processModel) return null;
        return processModel.orders.find((o) => o.orderId === selectedOrderId) ?? null;
    }, [selectedOrderId, processModel]);
    const selectedOrderRuntimeCapabilities = useMemo(
        () => deriveSelectedOrderCapabilitiesFromRuntime(
            selectedOrder,
            selectedRole?.roleKind,
            roleScopedMechanisms.visibleMechanisms,
            address as `0x${string}` | undefined,
        ),
        [selectedOrder, selectedRole?.roleKind, roleScopedMechanisms.visibleMechanisms, address],
    );
    const selectedOrderForModules = useMemo(
        () => selectedOrder
            ? {
                ...selectedOrder,
                capabilities: [...selectedOrder.capabilities, ...selectedOrderRuntimeCapabilities],
            }
            : null,
        [selectedOrder, selectedOrderRuntimeCapabilities],
    );
    const allRuntimeCapabilities = useMemo(
        () => [...institutionRuntimeCapabilities, ...runtimeCapabilities, ...selectedOrderRuntimeCapabilities],
        [institutionRuntimeCapabilities, runtimeCapabilities, selectedOrderRuntimeCapabilities],
    );
    const executableCapabilityIds = useMemo(
        () => new Set(allRuntimeCapabilities.map((capability) => capability.id)),
        [allRuntimeCapabilities],
    );
    const displayedCapabilities = useMemo(() => {
        const railCapabilities = allRuntimeCapabilities.filter((capability) => capability.scopeType !== "order");
        return railCapabilities.length > 0
            ? railCapabilities
            : (selectedRole?.activeCapabilities ?? []);
    }, [allRuntimeCapabilities, selectedRole?.activeCapabilities]);

    const resolvedServices = useMemo(
        () => resolveRuntimeServices(assembly, selectedBoundSubject),
        [assembly, selectedBoundSubject],
    );
    const shellPresentation = useMemo(
        () => resolveInstitutionShellPresentation(assembly, selectedBoundSubject),
        [assembly, selectedBoundSubject],
    );
    const baseSkinBundle = useMemo(
        () => resolveInstitutionSkinBundle(shellPresentation),
        [shellPresentation],
    );
    const [skinBundle, setSkinBundle] = useState(baseSkinBundle);

    useEffect(() => {
        let cancelled = false;
        setSkinBundle(baseSkinBundle);
        if (shellPresentation.assetDocument || !shellPresentation.assetURI) {
            return () => { cancelled = true; };
        }
        void resolveInstitutionSkinBundleFromTransport(
            shellPresentation,
            resolvedServices.evidenceTransport,
        ).then((resolvedSkinBundle) => {
            if (!cancelled && resolvedSkinBundle) setSkinBundle(resolvedSkinBundle);
        });
        return () => { cancelled = true; };
    }, [baseSkinBundle, shellPresentation, resolvedServices.evidenceTransport]);

    const { decimals: tokenDecimals } = useTokenDecimals(processModel?.currency);

    const moduleContext: ModuleRenderContext = useMemo(() => ({
        assembly,
        services: resolvedServices,
        runtimeContext,
        selectedRoleKind: selectedRole?.roleKind ?? "",
        selectedBoundSubject,
        shellPresentation,
        skinBundle,
        processModel,
        selectedOrder: selectedOrderForModules,
        capabilities: displayedCapabilities,
        executableCapabilityIds,
        executingCapabilityId,
        mechanisms: roleScopedMechanisms.visibleMechanisms,
        riskBoundaries,
        roles: roleContexts,
        onSelectRole: setSelectedRoleKind,
        onExecuteCapability: executeCapability,
        onSelectOrder: setSelectedOrderId,
        onComposeSubOrder: (orderId: string) => {
            const order = processModel?.orders.find((o) => o.orderId === orderId);
            if (order) openSubOrderComposer(order);
        },
        tokenDecimals,
    }), [
        assembly, resolvedServices, runtimeContext, selectedRole?.roleKind, selectedBoundSubject,
        shellPresentation, skinBundle, processModel, selectedOrderForModules,
        displayedCapabilities, executableCapabilityIds, executingCapabilityId,
        roleScopedMechanisms.visibleMechanisms, riskBoundaries, roleContexts,
        executeCapability, openSubOrderComposer, tokenDecimals,
    ]);

    const moduleBindings = assembly.modules
        .filter((binding) => visibleModuleIds.has(binding.moduleId))
        .sort((a, b) => a.priority - b.priority);

    const sidebarModules = moduleBindings.filter((b) => b.slot === "sidebar");
    const mainModules = moduleBindings.filter((b) => b.slot === "main");

    function renderModuleSlot(bindings: typeof moduleBindings) {
        return bindings.map((binding) => {
            const Component = getModule(binding.moduleId);
            if (!Component) return null;
            return (
                <Component
                    key={binding.moduleId}
                    moduleId={binding.moduleId}
                    binding={binding}
                    context={moduleContext}
                />
            );
        });
    }

    return (
        <div data-testid="assembly-workspace">
            <RuntimeServicesProvider services={resolvedServices}>
                <MerchantBrandingModule
                    sellerAddress={selectedBoundSubject?.subjectAddress}
                    brandingOverride={skinBundle?.branding ?? null}
                    dataSkinId={skinBundle?.skinId}
                >
                    <AssemblyShell
                        title={shellPresentation.title}
                        subtitle={shellPresentation.subtitle}
                        skin={skinBundle}
                        sidebar={(
                            <>
                                {renderModuleSlot(sidebarModules)}
                                <TransactionStatusBanner
                                    title="Transaction Status"
                                    activeLabel={activeActionLabel}
                                    isPending={isPending}
                                    isConfirming={isConfirming}
                                    isSuccess={isSuccess || mockIsSuccess}
                                    errorMessage={actionError}
                                />
                                <div className="space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Wallet Processes</p>
                                    {walletProcesses.length > 0 ? walletProcesses.map((summary) => (
                                        <ProcessSummaryCard
                                            key={summary.processId}
                                            process={processModel?.processId === summary.processId
                                                ? processModel
                                                : buildFallbackProcessModel(summary.processId, summary.orderCount, summary.hasActive)}
                                            orderCount={summary.orderCount}
                                            selected={summary.processId === effectiveProcessId}
                                            onSelect={() => handleSelectProcess(summary.processId)}
                                            skin={skinBundle}
                                        />
                                    )) : (
                                        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500 space-y-3">
                                            {!address ? (
                                                <>
                                                    <p>Connect a wallet to place orders and track active processes.</p>
                                                    <ConnectButton />
                                                </>
                                            ) : (
                                                <p>No active processes found for this wallet.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        main={(
                            <>
                                {renderModuleSlot(mainModules)}
                            </>
                        )}
                    />
                </MerchantBrandingModule>

                {effectiveProcessId && subOrderParent?.currency && subOrderParent.orderIds.length > 0 && (
                    <SubOrderModal
                        processId={effectiveProcessId}
                        parentOrderId={subOrderParent.orderIds[0]}
                        defaultParentOrderIds={subOrderParent.orderIds}
                        defaultCurrency={subOrderParent.currency}
                        onClose={closeSubOrderComposer}
                    />
                )}
            </RuntimeServicesProvider>
        </div>
    );
}
