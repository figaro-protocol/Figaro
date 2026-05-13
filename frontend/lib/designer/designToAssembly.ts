/**
 * designToAssembly — forward-derivation from a DesignSnapshot to a full
 * Assembly object. The partner of `assemblyToSyntheticOrders`; together
 * they form the (template ↔ instance) bridge.
 *
 * Pipeline (each step cites where the data lives):
 *
 *   1. Walk every order's anchored schemas (loaded by agreementHash via
 *      `loadAgreement`, the same data path `deriveDesignSurface` uses).
 *   2. Project each anchored schema through its spec's `block` binding
 *      to obtain its mechanism kind(s), drawer article, and module IDs.
 *   3. Project each anchored schema through `BlockMetadata` (block →
 *      schemas it owns + roles compatible with it) to obtain the modules
 *      the runtime should mount and the role kinds the assembly admits.
 *   4. Fill the remaining Assembly sections (views, capabilityPresentation,
 *      visibilityDefaults, builderMetadata) from convention defaults that
 *      mirror what `assemblyDraft.ts` scaffolds for blank assemblies.
 *   5. Apply the user's Prose overrides:
 *        snapshot.description           → identity.description
 *        snapshot.narrativeSummary      → narrative.assemblySummary
 *        snapshot.builderNotes          → narrative.builderNotes
 *        snapshot.mechanismLabels[k]    → mechanisms[k].displayName
 *        snapshot.roleLabels[k].*       → roles[k].displayName + sampleCapabilities
 *
 * Out-of-scope (not derivable from the snapshot; left at scaffold default
 * or `undefined` per the type allowing it):
 *   - contracts (deployment-context; canonical "core" entry only)
 *   - serviceBindings (runtime config)
 *   - roles[].description, .modulePriorities (no Prose capture today)
 *   - narrative.mechanismSummaries / .riskExplanations / .guaranteeExplanations
 *
 * The 6 hand-authored reference JSONs are the equivalence test fixtures —
 * see `tests/lib/designToAssembly.test.ts`.
 */

import type {
    Assembly,
    BuilderMetadata,
    CapabilityPresentationRule,
    ContractRef,
    MechanismAssembly,
    MechanismRiskClass,
    ModuleBinding,
    NarrativeLayer,
    RoleAssembly,
    ViewAssembly,
    VisibilityDefaults,
} from "@/lib/shared/assembly";
import type { Order } from "@/lib/core/store";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { getSchemaSpec } from "@/lib/shared/schemaSpecSource";
import { listBlockMetadata } from "@/lib/shared/blockMetadata";
import { loadAgreement } from "@/lib/core/agreementStore";
import {
    getMechanismKindsForDesign,
    getRoleKindsForDesign,
} from "@/lib/designer/deriveDesignSurface";

// Per-mechanism-kind scaffold defaults. riskClass and contractKeys are not
// derivable from schema membership alone; they describe the protocol risk
// posture of the mechanism, which is mechanism-kind-scoped doctrine.
const MECHANISM_KIND_DEFAULTS: Record<
    string,
    { riskClass: MechanismRiskClass; contractKeys: string[] }
> = {
    core: { riskClass: "read-only-inherited", contractKeys: ["core"] },
    coordinator: { riskClass: "low-risk-coordinator", contractKeys: ["core"] },
    attestation: { riskClass: "read-only-inherited", contractKeys: ["core"] },
    disclosure: { riskClass: "read-only-inherited", contractKeys: ["core"] },
    auction: { riskClass: "medium-risk-extension", contractKeys: ["core", "dutch-auction"] },
};

// Per-role-kind default sampleCapabilities. Mirrors `assemblyDraft.ts`
// for the two known kinds and extends to runtime-derived kinds. Prose
// overrides take precedence.
const ROLE_KIND_SAMPLE_CAPABILITIES: Record<string, string[]> = {
    buyer: ["create-order", "resolve-process", "withdraw"],
    seller: ["accept-offer", "withdraw"],
    merchant: ["accept-offer", "fulfil-order", "withdraw"],
    courier: ["accept-handoff", "complete-handoff", "withdraw"],
    offset: ["complete-disclosure", "withdraw"],
    "co-seller": ["accept-offer", "withdraw"],
};

export interface DesignToAssemblyOptions {
    /** Override for identity.id. Defaults to `${slug}-reference`. */
    id?: string;
    /** Override for identity.version. Defaults to "0.1.0". */
    version?: string;
    /** Override for identity.networkTargets. Defaults to ["local-anvil", "evm-compatible"]. */
    networkTargets?: string[];
    /** Override for builderMetadata.assemblyClass. Defaults to `reference-${slug}`. */
    assemblyClass?: string;
}

export function designToAssembly(
    snapshot: DesignSnapshot,
    options: DesignToAssemblyOptions = {},
): Assembly {
    const anchoredSchemas = collectAnchoredSchemas(snapshot.orders);
    const mechanismKinds = getMechanismKindsForDesign(snapshot.orders);
    const roleKinds = getRoleKindsForDesign(snapshot.orders);

    const identity = {
        id: options.id ?? `${snapshot.slug}-reference`,
        name: snapshot.name,
        slug: snapshot.slug,
        description: `${snapshot.name} reference assembly.`,
        networkTargets: options.networkTargets ?? ["local-anvil", "evm-compatible"],
        version: options.version ?? "0.1.0",
    };

    const contracts: ContractRef[] = [
        {
            key: "core",
            required: true,
            description: "Bonded process coordination substrate.",
        },
    ];

    const mechanisms: MechanismAssembly[] = mechanismKinds.map((kind) => {
        const defaults = MECHANISM_KIND_DEFAULTS[kind] ?? MECHANISM_KIND_DEFAULTS.core;
        const moduleBindings =
            kind === "core"
                ? []
                : uniqueSorted(
                      Array.from(anchoredSchemas)
                          .map((schemaId) => getSchemaSpec(schemaId)?.block)
                          .filter(
                              (block): block is NonNullable<typeof block> =>
                                  block !== undefined && block.mechanismKinds.includes(kind),
                          )
                          .flatMap((block) => Array.from(block.moduleIds)),
                  );
        return {
            mechanismId: `${kind}-orders`,
            kind,
            displayName: `Bonded ${titleCase(kind)} Coordination`,
            riskClass: defaults.riskClass,
            enabled: true,
            visibility: "primary",
            contractKeys: defaults.contractKeys,
            moduleBindings,
        };
    });

    const roles: RoleAssembly[] = roleKinds.map((kind) => ({
        roleKind: kind,
        displayName: titleCase(kind),
        visibility: "primary",
        defaultLandingView: "role-dashboard",
        sampleCapabilities: ROLE_KIND_SAMPLE_CAPABILITIES[kind] ?? [],
    }));

    const moduleIds = collectModuleIdsForDesign(anchoredSchemas);
    const modules: ModuleBinding[] = Array.from(moduleIds).map((moduleId) => ({
        moduleId,
        componentKind: moduleId,
        semanticInput: "default",
        slot: "main",
        priority: 100,
    }));

    const views: ViewAssembly[] = [
        {
            viewId: "assembly-overview",
            kind: "overview",
            title: "Assembly Overview",
            contextsAccepted: ["assembly"],
            moduleSlots: [],
        },
        {
            viewId: "role-dashboard",
            kind: "role-dashboard",
            title: "Role Dashboard",
            contextsAccepted: ["role", "process", "order"],
            moduleSlots: Array.from(moduleIds),
        },
    ];

    const capabilityPresentation: CapabilityPresentationRule[] = [
        { capabilityKind: "resolve-process", priority: 10, warningStyle: "warning" },
        { capabilityKind: "withdraw", priority: 7, warningStyle: "info" },
    ];

    const visibilityDefaults: VisibilityDefaults = {
        showGraphByDefault: true,
        showAdvancedMechanisms: false,
        showRiskBoundaries: true,
        showGuarantees: true,
        showEconomicBreakdowns: true,
        showBuilderMode: false,
        showAuditMode: false,
    };

    const narrative: NarrativeLayer | undefined = undefined;

    const builderMetadata: BuilderMetadata = {
        assemblyClass: options.assemblyClass ?? `reference-${snapshot.slug}`,
        compositionLevel: computeCompositionLevel(snapshot.orders),
        requiresCustomModules: false,
    };

    return {
        identity,
        contracts,
        mechanisms,
        roles,
        views,
        modules,
        capabilityPresentation,
        visibilityDefaults,
        narrative,
        builderMetadata,
    };
}

// ── Internal helpers ────────────────────────────────────────────────────

function collectAnchoredSchemas(orders: readonly Order[]): Set<string> {
    const out = new Set<string>();
    for (const order of orders) {
        if (!order.agreementHash) continue;
        const agreement = loadAgreement(order.agreementHash);
        if (!agreement) continue;
        for (const section of agreement.sections) out.add(section.schema);
    }
    return out;
}

function collectModuleIdsForDesign(anchoredSchemas: Set<string>): Set<string> {
    // A block owns an anchored schema when any of its module IDs appear
    // in that schema spec's `block.moduleIds` list. Derived inversely from
    // the schema spec — the single source of truth for schema → module
    // ownership. Replaces the prior duplicated `block.schemaIds` field.
    const anchoredModuleIds = new Set<string>();
    for (const schemaId of anchoredSchemas) {
        const blockBinding = getSchemaSpec(schemaId)?.block;
        if (!blockBinding) continue;
        for (const m of blockBinding.moduleIds) anchoredModuleIds.add(m);
    }
    const out = new Set<string>();
    for (const block of listBlockMetadata()) {
        const ownsAnchoredSchema = block.modules.some((m) => anchoredModuleIds.has(m.moduleId));
        const isShell = block.category === "shell";
        const isFixedBaseline = block.fixedBaseline === true;
        if (!(ownsAnchoredSchema || isShell || isFixedBaseline)) continue;
        for (const m of block.modules) out.add(m.moduleId);
    }
    return out;
}

function titleCase(slug: string): string {
    return slug
        .split(/[-_]/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
}

function uniqueSorted(values: Iterable<string>): string[] {
    return Array.from(new Set(values)).sort();
}

function computeCompositionLevel(orders: readonly Order[]): 1 | 2 | 3 {
    // Heuristic: order count as a proxy for DAG depth.
    // 1 order = level 1; 2-3 orders = level 2; 4+ = level 3.
    if (orders.length <= 1) return 1;
    if (orders.length <= 3) return 2;
    return 3;
}
