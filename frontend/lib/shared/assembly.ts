import type { CanonicalFulfilmentMethod } from "@/lib/core/orderAgreement";

export type TruthClass =
    | "protocol-enforced"
    | "protocol-derived"
    | "assembly-declared"
    | "indexer-derived"
    | "ui-local";

export type MechanismRiskClass =
    | "read-only-inherited"
    | "low-risk-coordinator"
    | "medium-risk-extension"
    | "high-risk-economic";

export type CompositionLevel = 1 | 2 | 3;

export type ScopeType = "assembly" | "process" | "order" | "role" | "mechanism";

export type RuntimeServiceKey =
    | "catalogue"
    | "discovery"
    | "evidenceTransport"
    | "coordinationMessaging"
    | "handoffPersistence"
    | "tokenConversion";

export interface AssemblyIdentity {
    id: string;
    name: string;
    slug: string;
    description?: string;
    networkTargets: string[];
    version: string;
}

export interface ContractRef {
    key: string;
    address?: `0x${string}`;
    required: boolean;
    description?: string;
}

export interface MechanismAssembly {
    mechanismId: string;
    kind: string;
    displayName: string;
    riskClass: MechanismRiskClass;
    enabled: boolean;
    visibility: "primary" | "secondary" | "advanced" | "hidden";
    group?: string;
    recognizedRoles?: string[];
    contractKeys?: string[];
    moduleBindings: string[];
    /** Explicit list of capability kinds this mechanism handles.
     *  When present, takes precedence over the inferMechanismIdFromCapability heuristic. */
    capabilityBindings?: string[];
}

export interface RoleAssembly {
    roleKind: string;
    displayName: string;
    description?: string;
    visibility: "primary" | "secondary" | "advanced" | "hidden";
    defaultLandingView?: string;
    modulePriorities?: string[];
    sampleCapabilities?: string[];
}

export interface ViewAssembly {
    viewId: string;
    kind: string;
    title: string;
    route?: string;
    contextsAccepted: ScopeType[];
    moduleSlots: string[];
}

export interface ModuleBinding {
    moduleId: string;
    componentKind: string;
    semanticInput: string;
    slot: string;
    priority: number;
    displayOptions?: Record<string, string | number | boolean>;
}

export interface ServiceBinding {
    serviceKey: RuntimeServiceKey;
    providerKey: string;
}

export interface CapabilityPresentationRule {
    capabilityKind: string;
    labelOverride?: string;
    priority?: number;
    group?: string;
    requiresConfirmation?: boolean;
    warningStyle?: "none" | "info" | "warning" | "danger";
}

export interface VisibilityDefaults {
    showGraphByDefault: boolean;
    showAdvancedMechanisms: boolean;
    showRiskBoundaries: boolean;
    showGuarantees: boolean;
    showEconomicBreakdowns: boolean;
    showBuilderMode: boolean;
    showAuditMode: boolean;
}

export interface NarrativeLayer {
    assemblySummary?: string;
    mechanismSummaries?: Record<string, string>;
    riskExplanations?: Record<string, string>;
    guaranteeExplanations?: Record<string, string>;
    builderNotes?: string;
}

export interface BuilderMetadata {
    assemblyClass: string;
    compositionLevel: CompositionLevel;
    requiresCustomModules: boolean;
    safetyWarnings?: string[];
}

export interface Assembly {
    identity: AssemblyIdentity;
    contracts: ContractRef[];
    serviceBindings?: ServiceBinding[];
    mechanisms: MechanismAssembly[];
    roles: RoleAssembly[];
    views: ViewAssembly[];
    modules: ModuleBinding[];
    capabilityPresentation: CapabilityPresentationRule[];
    visibilityDefaults: VisibilityDefaults;
    narrative?: NarrativeLayer;
    builderMetadata: BuilderMetadata;
    /** Optional seed for the root order's fulfilment method when this
     *  assembly is forked into the DAG editor. When absent, the bridge
     *  applies the synthetic default (`deliver:seller-assigned`). */
    defaultRootFulfilment?: CanonicalFulfilmentMethod;
}

// BEGIN GENERATED ASSEMBLY EXPORTS
/**
 * Reference assemblies previously hardcoded six example assemblies
 * (direct-sale, local-commerce, figaro-freelance, figaro-procurement,
 * figaro-disclosure-review, figaro-equipment-rental) loaded from
 * bundled JSON. Those have been removed — runtime discovery reads
 * from the on-chain `AssemblyRegistry` via `useAssemblyChoices`.
 *
 * The empty array is left in place because the upstream registry /
 * index / draft helpers expect an `Assembly[]` to iterate. They now
 * iterate over nothing, which is the correct empty state.
 *
 * The semantic-layer migration (lib/semantic/* etc.) hasn't moved yet —
 * those files still consume the `Assembly` TYPE, which is why this
 * file's type exports stay. The constants going to `[]` is the
 * "reference DATA" half of the cleanup.
 */
export const REFERENCE_ASSEMBLIES: Assembly[] = [];
// END GENERATED ASSEMBLY REGISTRY