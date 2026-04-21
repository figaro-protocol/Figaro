import {
    InstitutionAssembly,
    MechanismAssembly,
    ModuleBinding,
    RoleAssembly,
    ViewAssembly,
} from "@/lib/shared/institutionAssembly";
import {
    getEffectiveMechanismModuleBindings,
    getPackagedMechanismModuleBindings,
    mechanismClaimsCapability,
} from "@/lib/mechanisms/packageDefaults";
import { BUILT_IN_MODULE_IDS } from "@/lib/shared/builtInModuleDefaults";

export const SUPPORTED_RENDER_MODULE_SLOTS = ["sidebar", "main"] as const;

const SUPPORTED_RENDER_MODULE_SLOT_SET = new Set<string>(SUPPORTED_RENDER_MODULE_SLOTS);

export interface AssemblyValidationIssue {
    severity: "error" | "warning";
    path: string;
    message: string;
}

export interface AssemblyValidationResult {
    ok: boolean;
    issues: AssemblyValidationIssue[];
}

function findDuplicates(values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
            continue;
        }
        seen.add(value);
    }

    return [...duplicates];
}

function validateIdentity(assembly: InstitutionAssembly): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];
    const { identity } = assembly;

    if (!identity.id.trim()) {
        issues.push({ severity: "error", path: "identity.id", message: "Institution id is required." });
    }
    if (!identity.name.trim()) {
        issues.push({ severity: "error", path: "identity.name", message: "Institution name is required." });
    }
    if (!identity.slug.trim()) {
        issues.push({ severity: "error", path: "identity.slug", message: "Institution slug is required." });
    }
    if (identity.networkTargets.length === 0) {
        issues.push({ severity: "warning", path: "identity.networkTargets", message: "No network targets declared." });
    }

    return issues;
}

function validateModules(modules: ModuleBinding[]): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];

    for (const duplicate of findDuplicates(modules.map((module) => module.moduleId))) {
        issues.push({ severity: "error", path: "modules", message: `Duplicate module id: ${duplicate}.` });
    }

    modules.forEach((module, index) => {
        if (!module.moduleId.trim()) {
            issues.push({ severity: "error", path: `modules[${index}].moduleId`, message: "Module id is required." });
        }
        if (!module.componentKind.trim()) {
            issues.push({ severity: "error", path: `modules[${index}].componentKind`, message: "Component kind is required." });
        }
        if (!module.semanticInput.trim()) {
            issues.push({ severity: "warning", path: `modules[${index}].semanticInput`, message: "Semantic input should be declared." });
        }
        if (!SUPPORTED_RENDER_MODULE_SLOT_SET.has(module.slot)) {
            issues.push({
                severity: "error",
                path: `modules[${index}].slot`,
                message: `Unsupported module slot: ${module.slot}. The runtime currently renders only sidebar and main slots.`,
            });
        }
    });

    return issues;
}

function validateMechanisms(mechanisms: MechanismAssembly[], knownModuleIds: Set<string>): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];

    for (const duplicate of findDuplicates(mechanisms.map((mechanism) => mechanism.mechanismId))) {
        issues.push({ severity: "error", path: "mechanisms", message: `Duplicate mechanism id: ${duplicate}.` });
    }

    mechanisms.forEach((mechanism, index) => {
        const moduleBindings = getEffectiveMechanismModuleBindings(mechanism, knownModuleIds);

        if (!mechanism.displayName.trim()) {
            issues.push({ severity: "error", path: `mechanisms[${index}].displayName`, message: "Display name is required." });
        }

        if (mechanism.enabled && moduleBindings.length === 0) {
            issues.push({ severity: "warning", path: `mechanisms[${index}].moduleBindings`, message: "Enabled mechanism has no module bindings." });
        }

        for (const moduleId of moduleBindings) {
            if (!knownModuleIds.has(moduleId)) {
                issues.push({
                    severity: "error",
                    path: `mechanisms[${index}].moduleBindings`,
                    message: `Mechanism references unknown module: ${moduleId}.`,
                });
            }
        }
    });

    return issues;
}

function validateMechanismRoles(mechanisms: MechanismAssembly[], knownRoleKinds: Set<string>): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];

    mechanisms.forEach((mechanism, index) => {
        for (const roleKind of mechanism.recognizedRoles ?? []) {
            if (!knownRoleKinds.has(roleKind)) {
                issues.push({
                    severity: "error",
                    path: `mechanisms[${index}].recognizedRoles`,
                    message: `Mechanism references unknown role: ${roleKind}.`,
                });
            }
        }
    });

    return issues;
}

function validateMechanismContracts(mechanisms: MechanismAssembly[], knownContractKeys: Set<string>): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];

    mechanisms.forEach((mechanism, index) => {
        for (const contractKey of mechanism.contractKeys ?? []) {
            if (!knownContractKeys.has(contractKey)) {
                issues.push({
                    severity: "error",
                    path: `mechanisms[${index}].contractKeys`,
                    message: `Mechanism references unknown contract key: ${contractKey}.`,
                });
            }
        }
    });

    return issues;
}

function validateViews(views: ViewAssembly[], knownModuleIds: Set<string>): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];

    for (const duplicate of findDuplicates(views.map((view) => view.viewId))) {
        issues.push({ severity: "error", path: "views", message: `Duplicate view id: ${duplicate}.` });
    }

    views.forEach((view, index) => {
        if (!view.title.trim()) {
            issues.push({ severity: "error", path: `views[${index}].title`, message: "View title is required." });
        }
        if (view.contextsAccepted.length === 0) {
            issues.push({ severity: "warning", path: `views[${index}].contextsAccepted`, message: "View should accept at least one context." });
        }

        for (const moduleId of view.moduleSlots) {
            if (!knownModuleIds.has(moduleId)) {
                issues.push({
                    severity: "error",
                    path: `views[${index}].moduleSlots`,
                    message: `View references unknown module: ${moduleId}.`,
                });
            }
        }
    });

    return issues;
}

function validateRoles(roles: RoleAssembly[], knownViewIds: Set<string>): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];

    for (const duplicate of findDuplicates(roles.map((role) => role.roleKind))) {
        issues.push({ severity: "error", path: "roles", message: `Duplicate role kind: ${duplicate}.` });
    }

    roles.forEach((role, index) => {
        if (!role.displayName.trim()) {
            issues.push({ severity: "error", path: `roles[${index}].displayName`, message: "Role display name is required." });
        }

        if (role.defaultLandingView && !knownViewIds.has(role.defaultLandingView)) {
            issues.push({
                severity: "error",
                path: `roles[${index}].defaultLandingView`,
                message: `Role references unknown view: ${role.defaultLandingView}.`,
            });
        }
    });

    return issues;
}

function validateCapabilityBindings(assembly: InstitutionAssembly): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];

    // Collect all capabilities declared across roles
    const allCapabilities = new Set(
        assembly.roles.flatMap((role) => role.sampleCapabilities ?? [])
    );

    for (const cap of allCapabilities) {
        if (!assembly.mechanisms.some((mechanism) => mechanismClaimsCapability(mechanism, cap))) {
            issues.push({
                severity: "warning",
                path: "mechanisms.capabilityBindings",
                message: `Capability "${cap}" is declared in a role but not claimed by any mechanism or packaged default.`,
            });
        }
    }

    // Warn on explicit assembly claims that no role declares.
    const explicitBoundCapabilities = new Set(
        assembly.mechanisms.flatMap((mechanism) => mechanism.capabilityBindings ?? [])
    );

    for (const cap of explicitBoundCapabilities) {
        if (!allCapabilities.has(cap)) {
            issues.push({
                severity: "warning",
                path: "mechanisms.capabilityBindings",
                message: `Capability "${cap}" is bound to a mechanism but not declared in any role.`,
            });
        }
    }

    return issues;
}

function validateServiceBindings(assembly: InstitutionAssembly): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];
    const serviceKeys = assembly.serviceBindings?.map((binding) => binding.serviceKey) ?? [];

    for (const duplicate of findDuplicates(serviceKeys)) {
        issues.push({
            severity: "error",
            path: "serviceBindings",
            message: `Duplicate service binding for key: ${duplicate}.`,
        });
    }

    return issues;
}

function validateModuleSlots(mechanisms: MechanismAssembly[]): AssemblyValidationIssue[] {
    const issues: AssemblyValidationIssue[] = [];
    const builtInModuleIdSet = new Set(BUILT_IN_MODULE_IDS);

    mechanisms.forEach((mechanism, index) => {
        for (const moduleId of getPackagedMechanismModuleBindings(mechanism.kind)) {
            if (!builtInModuleIdSet.has(moduleId)) {
                issues.push({
                    severity: "warning",
                    path: `mechanisms[${index}].moduleBindings`,
                    message: `Built-in mechanism package references unknown module: ${moduleId}.`,
                });
            }
        }
    });

    return issues;
}

export function validateInstitutionAssembly(assembly: InstitutionAssembly): AssemblyValidationResult {
    const issues: AssemblyValidationIssue[] = [];
    const knownModuleIds = new Set(assembly.modules.map((module) => module.moduleId));
    const knownViewIds = new Set(assembly.views.map((view) => view.viewId));
    const knownContractKeys = new Set(assembly.contracts.map((contract) => contract.key));
    const knownRoleKinds = new Set(assembly.roles.map((role) => role.roleKind));

    issues.push(...validateIdentity(assembly));
    issues.push(...validateModules(assembly.modules));
    issues.push(...validateMechanisms(assembly.mechanisms, knownModuleIds));
    issues.push(...validateMechanismRoles(assembly.mechanisms, knownRoleKinds));
    issues.push(...validateMechanismContracts(assembly.mechanisms, knownContractKeys));
    issues.push(...validateServiceBindings(assembly));
    issues.push(...validateCapabilityBindings(assembly));
    issues.push(...validateModuleSlots(assembly.mechanisms));
    issues.push(...validateViews(assembly.views, knownModuleIds));
    issues.push(...validateRoles(assembly.roles, knownViewIds));

    if (assembly.builderMetadata.compositionLevel === 1) {
        const highRiskMechanisms = assembly.mechanisms.filter((mechanism) => mechanism.riskClass === "high-risk-economic");
        if (highRiskMechanisms.length > 0) {
            issues.push({
                severity: "warning",
                path: "builderMetadata.compositionLevel",
                message: "Composition level is 1 but includes high-risk mechanisms.",
            });
        }
    }

    return {
        ok: !issues.some((issue) => issue.severity === "error"),
        issues,
    };
}