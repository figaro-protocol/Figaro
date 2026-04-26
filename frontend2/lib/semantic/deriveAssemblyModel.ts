import {
    ContractRef,
    Assembly,
    MechanismAssembly,
    MechanismRiskClass,
} from "@/lib/shared/assembly";
import { getEffectiveMechanismModuleBindings } from "@/lib/mechanisms/packageDefaults";
import {
    AttachmentModel,
    GuaranteeModel,
    AssemblyModel,
    MechanismModel,
    RiskBoundaryModel,
} from "@/lib/semantic/models";
import { inferMechanismIdFromCapability } from "@/lib/semantic/assemblyCapabilityBinding";
import { deriveRoleContextsFromAssembly } from "@/lib/semantic/deriveRoleContextsFromAssembly";

function sourceFromAssembly(assemblyId: string, referenceId: string, sourceLabel = "assembly") {
    return {
        truthClass: "assembly-declared" as const,
        sourceLabel,
        referenceId: `${assemblyId}:${referenceId}`,
    };
}

function derivesTouchesAssets(riskClass: MechanismRiskClass): boolean {
    return riskClass === "high-risk-economic";
}

function deriveContractKeys(mechanism: MechanismAssembly, contracts: ContractRef[]): string[] {
    if ((mechanism.contractKeys?.length ?? 0) > 0) {
        return mechanism.contractKeys!.filter((key) => contracts.some((contract) => contract.key === key));
    }

    const preferredKeys = mechanism.kind === "core"
        ? ["core"]
        : mechanism.kind === "auction"
            ? ["core", "dutchAuctionDriverMarket"]
            : mechanism.kind === "coordinator"
                ? ["core", "deliveryCoordinator"]
                : ["core"];

    return preferredKeys.filter((key) => contracts.some((contract) => contract.key === key));
}

function deriveRecognizedRoles(mechanism: MechanismAssembly, assembly: Assembly): string[] {
    if ((mechanism.recognizedRoles?.length ?? 0) > 0) {
        return mechanism.recognizedRoles!;
    }

    return assembly.roles
        .filter((role) => role.visibility !== "hidden")
        .filter((role) => (role.sampleCapabilities ?? []).some(
            (capabilityKind) => inferMechanismIdFromCapability(capabilityKind, assembly.mechanisms) === mechanism.mechanismId
        ))
        .map((role) => role.roleKind);
}

function deriveMechanismAttachments(mechanism: MechanismAssembly, assembly: Assembly): AttachmentModel[] {
    const knownModuleIds = new Set(assembly.modules.map((module) => module.moduleId));
    const moduleBindings = getEffectiveMechanismModuleBindings(mechanism, knownModuleIds);
    const moduleAttachments: AttachmentModel[] = moduleBindings.map((moduleBinding) => ({
        id: `${mechanism.mechanismId}:module:${moduleBinding}`,
        mechanismId: mechanism.mechanismId,
        targetType: "mechanism",
        targetId: mechanism.mechanismId,
        label: moduleBinding,
        description: `${moduleBinding} is active within ${mechanism.displayName}'s runtime surface through the mechanism package and institution assembly.`,
        attachmentKind: "module-binding",
        state: mechanism.enabled ? "enabled" : "disabled",
        visibleByDefault: mechanism.visibility !== "hidden",
        source: sourceFromAssembly(assembly.identity.id, `${mechanism.mechanismId}:module:${moduleBinding}`),
    }));

    const contractAttachments: AttachmentModel[] = deriveContractKeys(mechanism, assembly.contracts).map((contractKey) => ({
        id: `${mechanism.mechanismId}:contract:${contractKey}`,
        mechanismId: mechanism.mechanismId,
        targetType: "mechanism",
        targetId: mechanism.mechanismId,
        label: contractKey,
        description: `${contractKey} is part of the mechanism boundary declared by the assembly.`,
        attachmentKind: "contract-reference",
        state: assembly.contracts.find((contract) => contract.key === contractKey)?.required ? "required" : "optional",
        visibleByDefault: true,
        source: sourceFromAssembly(assembly.identity.id, `${mechanism.mechanismId}:contract:${contractKey}`),
    }));

    return [...moduleAttachments, ...contractAttachments];
}

function deriveGuarantees(mechanism: MechanismAssembly, assemblyId: string): GuaranteeModel[] {
    const label = mechanism.riskClass === "high-risk-economic"
        ? "Mechanism-specific economic coordination"
        : mechanism.riskClass === "low-risk-coordinator"
            ? "Role-gated coordination and signaling"
            : "Inherited coordination semantics";

    return [
        {
            id: `${mechanism.mechanismId}-guarantee`,
            mechanismId: mechanism.mechanismId,
            label,
            description: `${mechanism.displayName} contributes assembly-level coordination semantics through the assembly layer.`,
            guaranteeClass: mechanism.riskClass,
            source: sourceFromAssembly(assemblyId, `${mechanism.mechanismId}:guarantee`),
        },
    ];
}

function deriveRiskBoundary(mechanism: MechanismAssembly): RiskBoundaryModel {
    const touchesAssets = derivesTouchesAssets(mechanism.riskClass);

    return {
        id: `${mechanism.mechanismId}-risk-boundary`,
        mechanismId: mechanism.mechanismId,
        riskClass: mechanism.riskClass,
        touchesAssets,
        canCustody: false,
        canReprice: mechanism.riskClass === "high-risk-economic",
        canOnlySignal: mechanism.riskClass === "low-risk-coordinator",
        dependsOn: ["core"],
        failureModes: touchesAssets
            ? ["Incorrect pricing or allocation logic", "Mechanism-specific economic failure"]
            : ["Incorrect coordination semantics", "Visibility or authority mismatch"],
    };
}

export function deriveAssemblyRiskBoundaries(assembly: Assembly): Record<string, RiskBoundaryModel> {
    return Object.fromEntries(
        assembly.mechanisms
            .filter((mechanism) => mechanism.enabled)
            .map((mechanism) => [mechanism.mechanismId, deriveRiskBoundary(mechanism)])
    );
}

function deriveMechanismModel(mechanism: MechanismAssembly, assembly: Assembly): MechanismModel {
    const guarantees = deriveGuarantees(mechanism, assembly.identity.id);
    const knownModuleIds = new Set(assembly.modules.map((module) => module.moduleId));
    const moduleBindings = getEffectiveMechanismModuleBindings(mechanism, knownModuleIds);
    const attachments = deriveMechanismAttachments(mechanism, assembly);

    return {
        id: mechanism.mechanismId,
        kind: mechanism.kind,
        name: mechanism.displayName,
        description: `${mechanism.displayName} is active in this institution assembly.`,
        riskClass: mechanism.riskClass,
        moduleBindings,
        contracts: deriveContractKeys(mechanism, assembly.contracts),
        touchesAssets: derivesTouchesAssets(mechanism.riskClass),
        recognizedRoles: deriveRecognizedRoles(mechanism, assembly),
        guarantees,
        attachments,
    };
}

export function deriveAssemblyModel(assembly: Assembly): AssemblyModel {
    const roles = deriveRoleContextsFromAssembly(assembly);

    return {
        id: assembly.identity.id,
        name: assembly.identity.name,
        slug: assembly.identity.slug,
        description: assembly.identity.description,
        network: assembly.identity.networkTargets[0] ?? "unknown",
        availableNetworks: assembly.identity.networkTargets,
        mechanisms: assembly.mechanisms.filter((mechanism) => mechanism.enabled).map((mechanism) => deriveMechanismModel(mechanism, assembly)),
        roles,
        processes: [],
        riskProfile: [...new Set(assembly.mechanisms.filter((mechanism) => mechanism.enabled).map((mechanism) => mechanism.riskClass))],
        source: sourceFromAssembly(assembly.identity.id, "assembly-model"),
    };
}