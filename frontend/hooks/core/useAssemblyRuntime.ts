"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import type { RegisteredAssembly } from "@/lib/shared/assemblyRegistry";
import type { ProcessSummary } from "@/hooks/core/useWalletProcessIds";
import { useWalletProcessIds } from "@/hooks/core/useWalletProcessIds";
import { useSemanticProcessWorkspace } from "@/hooks/core/useSemanticProcessWorkspace";
import { useOperatorProfile } from "@/lib/mechanisms/useOperatorRegistry";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";

import { deriveAssemblyCapabilities } from "@/lib/semantic/deriveAssemblyCapabilities";
import { deriveSelectedOrderCapabilitiesFromRuntime } from "@/lib/semantic/deriveSelectedOrderCapabilitiesFromRuntime";

import {
    ResolvedAssemblyRuntimeContext,
    resolveAssemblySkinBundleFromTransport,
    resolveAssemblySkinBundle,
    resolveAssemblyShellPresentation,
    resolveRoleScopedModuleSelection,
    resolveRoleScopedMechanismSelection,
    resolveRuntimeRoleSelection,
} from "@/lib/shared/runtimeResolution";
import { resolveRuntimeServices } from "@/lib/shared/runtimeServices";
import type { ModuleRenderContext } from "@/lib/shared/moduleRegistry";
import type { ModuleBinding } from "@/lib/shared/assembly";

export interface AssemblyRuntimeTransactionStatus {
    activeLabel: string | null;
    isPending: boolean;
    isConfirming: boolean;
    isSuccess: boolean;
    errorMessage: string | null;
}

export interface AssemblyRuntimeSubOrder {
    parent: { currency?: `0x${string}`; orderIds: string[] } | null;
    effectiveProcessId: string | null;
    close: () => void;
}

export interface AssemblyRuntime {
    context: ModuleRenderContext;
    moduleBindings: ModuleBinding[];
    sidebarBindings: ModuleBinding[];
    mainBindings: ModuleBinding[];
    walletProcesses: ProcessSummary[];
    selectedProcessId: string | null;
    onSelectProcess: (processId: string) => void;
    transactionStatus: AssemblyRuntimeTransactionStatus;
    subOrder: AssemblyRuntimeSubOrder;
    address?: `0x${string}`;
}

export function useAssemblyRuntime(
    artifact: RegisteredAssembly,
    runtimeContext?: ResolvedAssemblyRuntimeContext,
): AssemblyRuntime {
    const { address } = useAccount();
    const typedAddress = address as `0x${string}` | undefined;
    const { data: operatorProfile } = useOperatorProfile(typedAddress);
    const { assembly, model: assemblyModel, riskBoundaries } = artifact;
    const roleContexts = assemblyModel.roles;

    const runtimeRoleSelection = resolveRuntimeRoleSelection(
        address,
        runtimeContext?.boundSubjects ?? [],
        roleContexts,
    );
    const selectedBoundSubject = runtimeRoleSelection.matchedSubject;
    const selectableRoles = runtimeRoleSelection.availableRoles;

    const [selectedRoleKind, setSelectedRoleKind] = useState(roleContexts[0]?.roleKind ?? "");
    const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const walletProcesses = useWalletProcessIds(address);

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

    const onSelectProcess = (processId: string) => {
        setSelectedProcessId(processId);
        setSelectedOrderId(null);
        const params = new URLSearchParams(searchParams.toString());
        params.set("processId", processId);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const effectiveProcessId = selectedProcessId ?? walletProcesses[0]?.processId ?? null;
    const workspace = useSemanticProcessWorkspace({ processId: effectiveProcessId });

    useEffect(() => {
        if (!selectableRoles.some((role) => role.roleKind === selectedRoleKind)) {
            setSelectedRoleKind(
                runtimeRoleSelection.preferredRoleKind ?? selectableRoles[0]?.roleKind ?? "",
            );
        }
    }, [runtimeRoleSelection.preferredRoleKind, selectableRoles, selectedRoleKind]);

    const selectedRole = selectableRoles.find((role) => role.roleKind === selectedRoleKind) ?? selectableRoles[0];
    const activeViewId = selectedRole?.defaultLandingView ?? "buyer-view";
    const selectedViews = assembly.views.filter((view) => view.viewId === activeViewId);
    const selectedViewModuleIds = selectedViews.flatMap((view) => view.moduleSlots);

    const roleScopedMechanisms = resolveRoleScopedMechanismSelection(selectedRole, assemblyModel.mechanisms);
    const roleScopedModules = resolveRoleScopedModuleSelection(
        selectedViewModuleIds,
        roleScopedMechanisms.visibleMechanisms,
    );
    const visibleModuleIds = new Set(roleScopedModules.visibleModuleIds);

    const assemblyRuntimeCapabilities = useMemo(
        () => deriveAssemblyCapabilities(
            assembly.identity.id,
            selectedRole?.roleKind,
            roleScopedMechanisms.visibleMechanisms,
            operatorProfile,
        ),
        [assembly.identity.id, selectedRole?.roleKind, roleScopedMechanisms.visibleMechanisms, operatorProfile],
    );

    const selectedOrder = useMemo(() => {
        if (!selectedOrderId || !workspace.processModel) return null;
        return workspace.processModel.orders.find((o) => o.orderId === selectedOrderId) ?? null;
    }, [selectedOrderId, workspace.processModel]);

    const selectedOrderRuntimeCapabilities = useMemo(
        () => deriveSelectedOrderCapabilitiesFromRuntime(
            selectedOrder,
            selectedRole?.roleKind,
            roleScopedMechanisms.visibleMechanisms,
            typedAddress,
        ),
        [selectedOrder, selectedRole?.roleKind, roleScopedMechanisms.visibleMechanisms, typedAddress],
    );

    const selectedOrderForModules = useMemo(
        () => selectedOrder
            ? { ...selectedOrder, capabilities: [...selectedOrder.capabilities, ...selectedOrderRuntimeCapabilities] }
            : null,
        [selectedOrder, selectedOrderRuntimeCapabilities],
    );

    const allRuntimeCapabilities = useMemo(
        () => [...assemblyRuntimeCapabilities, ...workspace.runtimeCapabilities, ...selectedOrderRuntimeCapabilities],
        [assemblyRuntimeCapabilities, workspace.runtimeCapabilities, selectedOrderRuntimeCapabilities],
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
        () => resolveAssemblyShellPresentation(assembly, selectedBoundSubject),
        [assembly, selectedBoundSubject],
    );
    const baseSkinBundle = useMemo(
        () => resolveAssemblySkinBundle(shellPresentation),
        [shellPresentation],
    );
    const [skinBundle, setSkinBundle] = useState(baseSkinBundle);
    useEffect(() => {
        let cancelled = false;
        setSkinBundle(baseSkinBundle);
        if (shellPresentation.assetDocument || !shellPresentation.assetURI) {
            return () => { cancelled = true; };
        }
        void resolveAssemblySkinBundleFromTransport(
            shellPresentation,
            resolvedServices.evidenceTransport,
        ).then((resolvedSkinBundle) => {
            if (!cancelled && resolvedSkinBundle) setSkinBundle(resolvedSkinBundle);
        });
        return () => { cancelled = true; };
    }, [baseSkinBundle, shellPresentation, resolvedServices.evidenceTransport]);

    const { decimals: tokenDecimals } = useTokenDecimals(workspace.processModel?.currency);

    const context: ModuleRenderContext = useMemo(() => ({
        assembly,
        services: resolvedServices,
        runtimeContext,
        selectedRoleKind: selectedRole?.roleKind ?? "",
        selectedBoundSubject,
        shellPresentation,
        skinBundle,
        processModel: workspace.processModel,
        selectedOrder: selectedOrderForModules,
        capabilities: displayedCapabilities,
        executableCapabilityIds,
        executingCapabilityId: workspace.executingCapabilityId,
        mechanisms: roleScopedMechanisms.visibleMechanisms,
        riskBoundaries,
        roles: roleContexts,
        onSelectRole: setSelectedRoleKind,
        onExecuteCapability: workspace.executeCapability,
        onSelectOrder: setSelectedOrderId,
        onComposeSubOrder: (orderId: string) => {
            const order = workspace.processModel?.orders.find((o) => o.orderId === orderId);
            if (order) workspace.openSubOrderComposer(order);
        },
        tokenDecimals,
    }), [
        assembly, resolvedServices, runtimeContext, selectedRole?.roleKind, selectedBoundSubject,
        shellPresentation, skinBundle, workspace.processModel, selectedOrderForModules,
        displayedCapabilities, executableCapabilityIds, workspace.executingCapabilityId,
        roleScopedMechanisms.visibleMechanisms, riskBoundaries, roleContexts,
        workspace.executeCapability, workspace.openSubOrderComposer, tokenDecimals,
    ]);

    const moduleBindings = useMemo(
        () => assembly.modules
            .filter((binding) => visibleModuleIds.has(binding.moduleId))
            .sort((a, b) => a.priority - b.priority),
        [assembly.modules, visibleModuleIds],
    );

    const sidebarBindings = useMemo(
        () => moduleBindings.filter((b) => b.slot === "sidebar"),
        [moduleBindings],
    );
    const mainBindings = useMemo(
        () => moduleBindings.filter((b) => b.slot === "main"),
        [moduleBindings],
    );

    const transactionStatus: AssemblyRuntimeTransactionStatus = {
        activeLabel: workspace.activeActionLabel,
        isPending: workspace.isPending,
        isConfirming: workspace.isConfirming,
        isSuccess: workspace.isSuccess || workspace.mockIsSuccess,
        errorMessage: workspace.actionError,
    };

    const subOrder: AssemblyRuntimeSubOrder = {
        parent: workspace.subOrderParent,
        effectiveProcessId,
        close: workspace.closeSubOrderComposer,
    };

    return {
        context,
        moduleBindings,
        sidebarBindings,
        mainBindings,
        walletProcesses,
        selectedProcessId: effectiveProcessId,
        onSelectProcess,
        transactionStatus,
        subOrder,
        address: typedAddress,
    };
}
