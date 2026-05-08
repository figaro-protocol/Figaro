import {
    BuilderMetadata,
    CapabilityPresentationRule,
    ContractRef,
    Assembly,
    MechanismAssembly,
    NarrativeLayer,
    REFERENCE_ASSEMBLIES,
    RoleAssembly,
    ViewAssembly,
    VisibilityDefaults,
} from "@/lib/shared/assembly";
import {
    AuthoredModuleBindingDocument,
    toAuthoredViewAssemblyDocument,
    toAuthoredModuleBindingDocument,
} from "@/lib/shared/builtInModuleDefaults";
import {
    AssemblyValidationIssue,
    AssemblyValidationResult,
    validateAssembly,
} from "@/lib/shared/assemblyValidation";
import {
    deriveAssemblyModel,
    deriveAssemblyRiskBoundaries,
} from "@/lib/semantic/deriveAssemblyModel";
import { AssemblyModel, RiskBoundaryModel } from "@/lib/semantic/models";
import { parseAssemblyDocument } from "@/lib/shared/assemblyParser";

const ASSEMBLY_SECTION_KEYS = [
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

export type AssemblySectionKey = typeof ASSEMBLY_SECTION_KEYS[number];

export type AssemblySectionText = Record<AssemblySectionKey, string>;

export interface DraftPublicationReadiness {
    ok: boolean;
    issues: AssemblyValidationIssue[];
}

export interface DraftAssemblyArtifact {
    assembly: Assembly;
    validation: AssemblyValidationResult;
    publication: DraftPublicationReadiness;
    model: AssemblyModel;
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
            viewId: "assembly-overview",
            kind: "overview",
            title: "Assembly Overview",
            route: "/",
            contextsAccepted: ["assembly"],
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
        assemblySummary: `${options.name} as a composed institution built from authored assembly metadata and shared semantic modules.`,
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

export function buildBlankAssembly(options: BuildDraftOptions = {}): Assembly {
    const slug = options.slug ?? "draft-assembly";
    const name = options.name ?? titleCaseFromSlug(slug);
    const fullOptions: Required<BuildDraftOptions> = {
        name,
        slug,
        description: options.description ?? `${name} reference assembly.`,
        assemblyClass: options.assemblyClass ?? "reference-template",
        compositionLevel: options.compositionLevel ?? 1,
    };

    return parseAssemblyDocument({
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

export function cloneAssemblyDraft(assembly: Assembly): Assembly {
    return parseAssemblyDocument(JSON.parse(JSON.stringify(assembly)), "cloned institution assembly draft");
}

function toAuthoredAssemblyDocument(assembly: Assembly) {
    return {
        ...assembly,
        views: assembly.views.map((view) => toAuthoredViewAssemblyDocument(view, assembly.modules)),
        modules: assembly.modules.map((module) => toAuthoredModuleBindingDocument(module)),
    };
}

export function buildAssemblySectionText(assembly: Assembly): AssemblySectionText {
    const authoredDocument = toAuthoredAssemblyDocument(assembly);

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

export function serializeAssemblyDocument(assembly: Assembly): string {
    return `${JSON.stringify(toAuthoredAssemblyDocument(assembly), null, 4)}\n`;
}

export function validateDraftPublicationReadiness(
    assembly: Assembly,
    registeredAssemblies: Assembly[] = REFERENCE_ASSEMBLIES
): DraftPublicationReadiness {
    const issues: AssemblyValidationIssue[] = [...validateAssembly(assembly).issues];

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

export function buildDraftRegisteredAssembly(
    assembly: Assembly,
    registeredAssemblies: Assembly[] = REFERENCE_ASSEMBLIES
): DraftAssemblyArtifact {
    return {
        assembly,
        validation: validateAssembly(assembly),
        publication: validateDraftPublicationReadiness(assembly, registeredAssemblies),
        model: deriveAssemblyModel(assembly),
        riskBoundaries: deriveAssemblyRiskBoundaries(assembly),
    };
}