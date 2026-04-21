import {
    BuilderMetadata,
    CapabilityPresentationRule,
    ContractRef,
    InstitutionAssembly,
    MechanismAssembly,
    NarrativeLayer,
    REFERENCE_ASSEMBLIES,
    RoleAssembly,
    ViewAssembly,
    VisibilityDefaults,
} from "@/lib/shared/institutionAssembly";
import {
    AuthoredModuleBindingDocument,
    toAuthoredViewAssemblyDocument,
    toAuthoredModuleBindingDocument,
} from "@/lib/shared/builtInModuleDefaults";
import {
    AssemblyValidationIssue,
    AssemblyValidationResult,
    validateInstitutionAssembly,
} from "@/lib/shared/institutionAssemblyValidation";
import {
    deriveInstitutionModelFromAssembly,
    deriveRiskBoundaryModelsFromAssembly,
} from "@/lib/semantic/deriveInstitutionFromAssembly";
import { InstitutionModel, RiskBoundaryModel } from "@/lib/semantic/models";
import { parseInstitutionAssemblyDocument } from "@/lib/shared/institutionAssemblyParser";

export const INSTITUTION_ASSEMBLY_SECTION_KEYS = [
    "identity",
    "contracts",
    "mechanisms",
    "roles",
    "views",
    "modules",
    "capabilityPresentation",
    "visibilityDefaults",
    "narrative",
    "builderMetadata",
] as const;

export type InstitutionAssemblySectionKey = typeof INSTITUTION_ASSEMBLY_SECTION_KEYS[number];

export type InstitutionAssemblySectionText = Record<InstitutionAssemblySectionKey, string>;

export interface DraftPublicationReadiness {
    ok: boolean;
    issues: AssemblyValidationIssue[];
}

export interface DraftInstitutionArtifact {
    assembly: InstitutionAssembly;
    validation: AssemblyValidationResult;
    publication: DraftPublicationReadiness;
    model: InstitutionModel;
    riskBoundaries: Record<string, RiskBoundaryModel>;
}

interface BuildDraftOptions {
    name?: string;
    slug?: string;
    description?: string;
    assemblyClass?: string;
    compositionLevel?: BuilderMetadata["compositionLevel"];
}

function titleCaseFromSlug(slug: string): string {
    return slug
        .split("-")
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
}

function buildIdentitySection(options: Required<BuildDraftOptions>) {
    return {
        id: `${options.slug}-reference`,
        name: options.name,
        slug: options.slug,
        description: options.description,
        networkTargets: ["local-anvil", "evm-compatible"],
        version: "0.1.0",
    };
}

function buildContractSection(): ContractRef[] {
    return [
        {
            key: "core",
            required: true,
            description: "Bonded process coordination substrate.",
        },
    ];
}

function buildMechanismSection(options: Required<BuildDraftOptions>): MechanismAssembly[] {
    return [
        {
            mechanismId: "core-orders",
            kind: "core",
            displayName: `${titleCaseFromSlug(options.slug)} Core Coordination`,
            riskClass: "read-only-inherited",
            enabled: true,
            visibility: "primary",
            contractKeys: ["core"],
            moduleBindings: [],
        },
    ];
}

function buildRoleSection(options: Required<BuildDraftOptions>): RoleAssembly[] {
    const defaultLandingView = `${options.slug}-dashboard`;
    return [
        {
            roleKind: "buyer",
            displayName: "Buyer",
            visibility: "primary",
            defaultLandingView,
            sampleCapabilities: ["create-order", "resolve-process", "withdraw"],
        },
        {
            roleKind: "seller",
            displayName: "Seller",
            visibility: "primary",
            defaultLandingView,
            sampleCapabilities: ["accept-offer", "withdraw"],
        },
    ];
}

function buildViewSection(options: Required<BuildDraftOptions>): ViewAssembly[] {
    return [
        {
            viewId: "institution-overview",
            kind: "overview",
            title: "Institution Overview",
            route: "/",
            contextsAccepted: ["institution"],
            moduleSlots: ["capability-rail", "mechanism-inspector"],
        },
        {
            viewId: `${options.slug}-dashboard`,
            kind: "role-dashboard",
            title: "Role Dashboard",
            contextsAccepted: ["role", "process", "order"],
            moduleSlots: ["role-switcher", "capability-rail", "process-graph", "order-node"],
        },
    ];
}

function buildModuleSection(): AuthoredModuleBindingDocument[] {
    return [
        {
            moduleId: "role-switcher",
        },
        {
            moduleId: "capability-rail",
        },
        {
            moduleId: "process-graph",
        },
        {
            moduleId: "order-node",
        },
        {
            moduleId: "order-actions",
        },
        {
            moduleId: "settlement-breakdown",
        },
        {
            moduleId: "mechanism-inspector",
        },
    ];
}

function buildCapabilityPresentationSection(): CapabilityPresentationRule[] {
    return [
        {
            capabilityKind: "resolve-process",
            priority: 10,
            warningStyle: "warning",
        },
        {
            capabilityKind: "withdraw",
            priority: 7,
            warningStyle: "info",
        },
    ];
}

function buildVisibilityDefaultsSection(): VisibilityDefaults {
    return {
        showGraphByDefault: true,
        showAdvancedMechanisms: false,
        showRiskBoundaries: true,
        showGuarantees: true,
        showEconomicBreakdowns: true,
        showBuilderMode: false,
        showAuditMode: false,
    };
}

function buildNarrativeSection(options: Required<BuildDraftOptions>): NarrativeLayer {
    return {
        institutionSummary: `${options.name} as a composed institution built from authored assembly metadata and shared semantic modules.`,
        builderNotes: "Generated draft. Refine roles, mechanisms, and module composition before publication.",
    };
}

function buildBuilderMetadataSection(options: Required<BuildDraftOptions>): BuilderMetadata {
    return {
        assemblyClass: options.assemblyClass,
        compositionLevel: options.compositionLevel,
        requiresCustomModules: false,
        safetyWarnings: ["Generated draft. Review contract keys, role capabilities, and view module slots before publication."],
    };
}

export function buildBlankInstitutionAssembly(options: BuildDraftOptions = {}): InstitutionAssembly {
    const slug = options.slug ?? "draft-institution";
    const name = options.name ?? titleCaseFromSlug(slug);
    const fullOptions: Required<BuildDraftOptions> = {
        name,
        slug,
        description: options.description ?? `${name} reference institution assembly.`,
        assemblyClass: options.assemblyClass ?? "reference-template",
        compositionLevel: options.compositionLevel ?? 1,
    };

    return parseInstitutionAssemblyDocument({
        identity: buildIdentitySection(fullOptions),
        contracts: buildContractSection(),
        mechanisms: buildMechanismSection(fullOptions),
        roles: buildRoleSection(fullOptions),
        views: buildViewSection(fullOptions),
        modules: buildModuleSection(),
        capabilityPresentation: buildCapabilityPresentationSection(),
        visibilityDefaults: buildVisibilityDefaultsSection(),
        narrative: buildNarrativeSection(fullOptions),
        builderMetadata: buildBuilderMetadataSection(fullOptions),
    }, "draft assembly template");
}

export function cloneInstitutionAssemblyDraft(assembly: InstitutionAssembly): InstitutionAssembly {
    return parseInstitutionAssemblyDocument(JSON.parse(JSON.stringify(assembly)), "cloned institution assembly draft");
}

function toAuthoredInstitutionAssemblyDocument(assembly: InstitutionAssembly) {
    return {
        ...assembly,
        views: assembly.views.map((view) => toAuthoredViewAssemblyDocument(view, assembly.modules)),
        modules: assembly.modules.map((module) => toAuthoredModuleBindingDocument(module)),
    };
}

export function buildInstitutionAssemblySectionText(assembly: InstitutionAssembly): InstitutionAssemblySectionText {
    const authoredDocument = toAuthoredInstitutionAssemblyDocument(assembly);

    return {
        identity: `${JSON.stringify(authoredDocument.identity, null, 4)}\n`,
        contracts: `${JSON.stringify(authoredDocument.contracts, null, 4)}\n`,
        mechanisms: `${JSON.stringify(authoredDocument.mechanisms, null, 4)}\n`,
        roles: `${JSON.stringify(authoredDocument.roles, null, 4)}\n`,
        views: `${JSON.stringify(authoredDocument.views, null, 4)}\n`,
        modules: `${JSON.stringify(authoredDocument.modules, null, 4)}\n`,
        capabilityPresentation: `${JSON.stringify(authoredDocument.capabilityPresentation, null, 4)}\n`,
        visibilityDefaults: `${JSON.stringify(authoredDocument.visibilityDefaults, null, 4)}\n`,
        narrative: `${JSON.stringify(authoredDocument.narrative ?? {}, null, 4)}\n`,
        builderMetadata: `${JSON.stringify(authoredDocument.builderMetadata, null, 4)}\n`,
    };
}

export function serializeInstitutionAssemblyDocument(assembly: InstitutionAssembly): string {
    return `${JSON.stringify(toAuthoredInstitutionAssemblyDocument(assembly), null, 4)}\n`;
}

export function validateDraftPublicationReadiness(
    assembly: InstitutionAssembly,
    registeredAssemblies: InstitutionAssembly[] = REFERENCE_ASSEMBLIES
): DraftPublicationReadiness {
    const issues: AssemblyValidationIssue[] = [...validateInstitutionAssembly(assembly).issues];

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assembly.identity.slug)) {
        issues.push({
            severity: "error",
            path: "identity.slug",
            message: "Institution slug must be kebab-case using lowercase letters, numbers, and hyphens only.",
        });
    }

    if (registeredAssemblies.some((entry) => entry.identity.slug === assembly.identity.slug)) {
        issues.push({
            severity: "error",
            path: "identity.slug",
            message: `Institution slug ${assembly.identity.slug} is already registered.`,
        });
    }

    if (registeredAssemblies.some((entry) => entry.identity.id === assembly.identity.id)) {
        issues.push({
            severity: "error",
            path: "identity.id",
            message: `Institution id ${assembly.identity.id} is already registered.`,
        });
    }

    return {
        ok: !issues.some((issue) => issue.severity === "error"),
        issues,
    };
}

export function buildDraftInstitutionArtifact(
    assembly: InstitutionAssembly,
    registeredAssemblies: InstitutionAssembly[] = REFERENCE_ASSEMBLIES
): DraftInstitutionArtifact {
    return {
        assembly,
        validation: validateInstitutionAssembly(assembly),
        publication: validateDraftPublicationReadiness(assembly, registeredAssemblies),
        model: deriveInstitutionModelFromAssembly(assembly),
        riskBoundaries: deriveRiskBoundaryModelsFromAssembly(assembly),
    };
}