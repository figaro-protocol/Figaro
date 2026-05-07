// BEGIN GENERATED ASSEMBLY IMPORTS
import directSaleReference from "@/lib/shared/assemblies/direct-sale.reference.json";
import figaroDisclosureReviewReference from "@/lib/shared/assemblies/figaro-disclosure-review.reference.json";
import localCommerceReference from "@/lib/shared/assemblies/local-commerce.reference.json";
import figaroEquipmentRentalReference from "@/lib/shared/assemblies/figaro-equipment-rental.reference.json";
import figaroFreelanceReference from "@/lib/shared/assemblies/figaro-freelance.reference.json";
import figaroProcurementReference from "@/lib/shared/assemblies/figaro-procurement.reference.json";
// END GENERATED ASSEMBLY IMPORTS
import { parseAssemblyDocument } from "@/lib/shared/assemblyParser";
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
    | "identity"
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
export const DIRECT_SALE_REFERENCE_ASSEMBLY = parseAssemblyDocument(
    directSaleReference,
    "direct-sale.reference.json"
);

export const LOCAL_COMMERCE_REFERENCE_ASSEMBLY = parseAssemblyDocument(
    localCommerceReference,
    "local-commerce.reference.json"
);

export const FIGARO_PROCUREMENT_REFERENCE_ASSEMBLY = parseAssemblyDocument(
    figaroProcurementReference,
    "figaro-procurement.reference.json"
);

export const FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY = parseAssemblyDocument(
    figaroDisclosureReviewReference,
    "figaro-disclosure-review.reference.json"
);

export const FIGARO_EQUIPMENT_RENTAL_REFERENCE_ASSEMBLY = parseAssemblyDocument(
    figaroEquipmentRentalReference,
    "figaro-equipment-rental.reference.json"
);

export const FIGARO_FREELANCE_REFERENCE_ASSEMBLY = parseAssemblyDocument(
    figaroFreelanceReference,
    "figaro-freelance.reference.json"
);
// END GENERATED ASSEMBLY EXPORTS

// BEGIN GENERATED ASSEMBLY REGISTRY
export const REFERENCE_ASSEMBLIES: Assembly[] = [
    DIRECT_SALE_REFERENCE_ASSEMBLY,
    LOCAL_COMMERCE_REFERENCE_ASSEMBLY,
    FIGARO_PROCUREMENT_REFERENCE_ASSEMBLY,
    FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY,
    FIGARO_EQUIPMENT_RENTAL_REFERENCE_ASSEMBLY,
    FIGARO_FREELANCE_REFERENCE_ASSEMBLY,
];
// END GENERATED ASSEMBLY REGISTRY