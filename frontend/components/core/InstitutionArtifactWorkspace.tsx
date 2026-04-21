"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { AssemblyShell } from "@/components/core/AssemblyShell";
import { MerchantBrandingModule } from "@/components/modules/MerchantBrandingModule";
import { RoleSwitcher } from "@/components/core/RoleSwitcher";
import { CapabilityRail } from "@/components/core/CapabilityRail";
import { MechanismInspectorCard } from "@/components/core/MechanismInspectorCard";
import { ProcessSummaryCard } from "@/components/core/ProcessSummaryCard";
import { InstitutionProcessWorkspace } from "@/components/core/InstitutionProcessWorkspace";
import { SubOrderModal } from "@/components/core/SubOrderModal";
import { TransactionStatusBanner } from "@/components/core/TransactionStatusBanner";
import { useWalletProcessIds } from "@/hooks/core/useWalletProcessIds";
import { useSemanticProcessWorkspace } from "@/hooks/core/useSemanticProcessWorkspace";
import { useOperatorProfile } from "@/lib/mechanisms/useOperatorRegistry";
import { deriveInstitutionCapabilitiesFromRuntime } from "@/lib/semantic/deriveInstitutionCapabilitiesFromRuntime";
import { ProcessModel, RiskBoundaryModel } from "@/lib/semantic/models";
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
import { resolveRuntimeServices } from "@/lib/shared/runtimeServices";

interface Props {
    artifact: RegisteredInstitutionArtifact;
    shellLabel?: string;
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

function resolveRiskBoundary(
    riskBoundaries: Record<string, RiskBoundaryModel>,
    mechanismId: string
): RiskBoundaryModel | undefined {
    return riskBoundaries[mechanismId];
}

export function InstitutionArtifactWorkspace({ artifact, shellLabel, runtimeContext }: Props) {
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
        selectedParentOrderIds,
        subOrderParent,
        executeCapability,
        toggleParentSelection,
        openMultiParentComposer,
        closeSubOrderComposer,
    } = useSemanticProcessWorkspace({ processId: effectiveProcessId });

    useEffect(() => {
        if (!selectableRoles.some((role) => role.roleKind === selectedRoleKind)) {
            setSelectedRoleKind(runtimeRoleSelection.preferredRoleKind ?? selectableRoles[0]?.roleKind ?? "");
        }
    }, [runtimeRoleSelection.preferredRoleKind, selectableRoles, selectedRoleKind]);

    const selectedRole = selectableRoles.find((role) => role.roleKind === selectedRoleKind) ?? selectableRoles[0];
    const selectedViews = assembly.views.filter((view) =>
        view.viewId === "institution-overview" || view.viewId === selectedRole?.defaultLandingView
    );
    const selectedViewModuleIds = selectedViews.flatMap((view) => view.moduleSlots);
    const roleScopedMechanisms = resolveRoleScopedMechanismSelection(selectedRole, institutionModel.mechanisms);
    const roleScopedModules = resolveRoleScopedModuleSelection(selectedViewModuleIds, roleScopedMechanisms.visibleMechanisms);
    const visibleModuleIds = new Set(roleScopedModules.visibleModuleIds);
    const visibleModulesSummary = [...visibleModuleIds].sort().join(", ");
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
            return () => {
                cancelled = true;
            };
        }

        void resolveInstitutionSkinBundleFromTransport(
            shellPresentation,
            resolvedServices.evidenceTransport,
        ).then((resolvedSkinBundle) => {
            if (!cancelled && resolvedSkinBundle) {
                setSkinBundle(resolvedSkinBundle);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [baseSkinBundle, shellPresentation, resolvedServices.evidenceTransport]);
    const institutionRuntimeCapabilities = deriveInstitutionCapabilitiesFromRuntime(
        assembly.identity.id,
        selectedRole?.roleKind,
        roleScopedMechanisms.visibleMechanisms,
        operatorProfile,
    );
    const allRuntimeCapabilities = [...institutionRuntimeCapabilities, ...runtimeCapabilities];
    const executableCapabilityIds = new Set(allRuntimeCapabilities.map((capability) => capability.id));
    const railCapabilities = allRuntimeCapabilities.filter((capability) => capability.scopeType !== "order");
    const displayedCapabilities = railCapabilities.length > 0
        ? railCapabilities
        : (selectedRole?.activeCapabilities ?? []);

    return (
        <>
            <MerchantBrandingModule
                sellerAddress={selectedBoundSubject?.subjectAddress}
                brandingOverride={skinBundle?.branding ?? null}
                dataSkinId={skinBundle?.skinId}
            >
                <AssemblyShell
                    title={shellPresentation.title}
                    subtitle={shellPresentation.subtitle || "Prototype institution shell rendered from assembly metadata, derived role contexts, and reusable mechanism-level UI modules."}
                    skin={skinBundle}
                    sidebar={(
                        <>
                            {visibleModuleIds.has("role-switcher") && (
                                <RoleSwitcher
                                    roles={selectableRoles}
                                    selectedRoleKind={selectedRole?.roleKind ?? ""}
                                    onSelectRole={setSelectedRoleKind}
                                    contextLabel={shellPresentation.title}
                                    skin={skinBundle}
                                />
                            )}
                            <TransactionStatusBanner
                                title="Transaction Status"
                                activeLabel={activeActionLabel}
                                isPending={isPending}
                                isConfirming={isConfirming}
                                isSuccess={isSuccess || mockIsSuccess}
                                errorMessage={actionError}
                            />
                            {visibleModuleIds.has("capability-rail") && (
                                <CapabilityRail
                                    capabilities={displayedCapabilities}
                                    executableCapabilityIds={executableCapabilityIds}
                                    executingCapabilityId={executingCapabilityId}
                                    onExecute={executeCapability}
                                    contextLabel={shellPresentation.title}
                                    skin={skinBundle}
                                />
                            )}
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
                                        onSelect={() => setSelectedProcessId(summary.processId)}
                                        skin={skinBundle}
                                    />
                                )) : (
                                    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                                        Connect a wallet that has participated in a process to populate live process models.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    main={(
                        <>
                            <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-black">
                                <p className="font-semibold mb-2">Derived Institution Snapshot</p>
                                <p>Assembly: <span className="font-mono">{assembly.identity.slug}</span></p>
                                <p>Runtime source kind: <span className="font-mono">{runtimeContext?.sourceMetadata.sourceKind ?? "unknown"}</span></p>
                                <p>Runtime source label: <span className="font-mono">{runtimeContext?.sourceMetadata.sourceLabel ?? "runtime-data-source"}</span></p>
                                <p>Runtime transport: <span className="font-mono">{runtimeContext?.sourceMetadata.transport ?? "in-memory"}</span></p>
                                <p>Network: <span className="font-mono">{institutionModel.network}</span></p>
                                <p>Available networks: <span className="font-mono">{institutionModel.availableNetworks.join(", ")}</span></p>
                                <p>Declared roles: <span className="font-mono">{institutionModel.roles.length}</span></p>
                                <p>Selectable roles: <span className="font-mono">{selectableRoles.length}</span></p>
                                <p>Selected role: <span className="font-mono">{selectedRole?.roleKind ?? "none"}</span></p>
                                <p>Role source: <span className="font-mono">{runtimeRoleSelection.matchedSubject ? "runtime-bound" : "assembly-default"}</span></p>
                                <p>Bound subject: <span className="font-mono">{runtimeRoleSelection.matchedSubject?.displayName ?? "none"}</span></p>
                                <p>Shell title source: <span className="font-mono">{shellPresentation.sourceKind}</span></p>
                                <p>Shell binding: <span className="font-mono">{shellPresentation.bindingId ?? "none"}</span></p>
                                <p>Shell metadata URI: <span className="font-mono">{shellPresentation.metadataURI ?? "none"}</span></p>
                                <p>Shell asset URI: <span className="font-mono">{shellPresentation.assetURI ?? "none"}</span></p>
                                <p>Skin bundle: <span className="font-mono">{skinBundle?.skinId ?? "none"}</span></p>
                                <p>Skin CSS URL: <span className="font-mono">{skinBundle?.branding.cssURL ?? "none"}</span></p>
                                <p>Bound subject provenance: <span className="font-mono">{runtimeRoleSelection.matchedSubject?.provenance?.quality ?? "none"}</span></p>
                                <p>Bound subject signed: <span className="font-mono">{runtimeRoleSelection.matchedSubject?.provenance?.hasSignatures ? "yes" : "no"}</span></p>
                                <p>Bound subject refs: <span className="font-mono">{runtimeRoleSelection.matchedSubject ? `${runtimeRoleSelection.matchedSubject.provenance?.bindingRefs.length ?? 0} binding, ${runtimeRoleSelection.matchedSubject.provenance?.signatureRefs.length ?? 0} signature, ${runtimeRoleSelection.matchedSubject.provenance?.metadataRefs.length ?? 0} metadata, ${runtimeRoleSelection.matchedSubject.provenance?.assetRefs.length ?? 0} asset` : "none"}</span></p>
                                <p>Bound subject issues: <span className="font-mono">{runtimeRoleSelection.matchedSubject?.provenance?.issues.join(", ") || "none"}</span></p>
                                <p>Role hints: <span className="font-mono">{runtimeRoleSelection.roleHints.join(", ") || "none"}</span></p>
                                <p>Visible mechanisms: <span className="font-mono">{roleScopedMechanisms.visibleMechanisms.map((mechanism) => mechanism.id).join(", ") || "none"}</span></p>
                                <p>Selected process: <span className="font-mono">{effectiveProcessId ?? "none"}</span></p>
                                <p>Visible modules: <span className="font-mono">{visibleModulesSummary || "none"}</span></p>
                                <p>Capability source: <span className="font-mono">{runtimeCapabilities.length > 0 ? "runtime-derived" : "assembly-sample"}</span></p>
                                <p>Runtime capabilities: <span className="font-mono">{runtimeCapabilities.length}</span></p>
                            </div>

                            {processModel && visibleModuleIds.has("process-graph") && (
                                <InstitutionProcessWorkspace
                                    process={processModel}
                                    executableCapabilityIds={executableCapabilityIds}
                                    executingCapabilityId={executingCapabilityId}
                                    onExecuteCapability={executeCapability}
                                    selectedParentOrderIds={selectedParentOrderIds}
                                    onToggleParentSelection={toggleParentSelection}
                                    onComposeFromSelection={openMultiParentComposer}
                                />
                            )}

                            {visibleModuleIds.has("mechanism-inspector") && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {roleScopedMechanisms.visibleMechanisms.map((mechanism) => (
                                        <MechanismInspectorCard
                                            key={mechanism.id}
                                            mechanism={mechanism}
                                            riskBoundary={resolveRiskBoundary(riskBoundaries, mechanism.id)}
                                            skin={skinBundle}
                                        />
                                    ))}
                                </div>
                            )}
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
        </>
    );
}