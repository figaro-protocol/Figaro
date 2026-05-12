/**
 * SCHEMA_OWNERSHIP — explicit map from protocol schemaId to its UI block.
 *
 * Source of truth for the canvas → assembly derivation pipeline. When a
 * designer toggles a drawer article on, the canvas walks each schema's
 * ownership entry to assemble per-role view moduleSlots in the generated
 * Assembly JSON.
 *
 * Why a hand-maintained map (and not derived from BlockMetadata):
 *   - BlockMetadata.schemaIds gives one direction (block → schemas it
 *     owns). This map gives the other (schemaId → block(s) + mechanism
 *     kind(s) + drawer article).
 *   - Drawer article assignment isn't expressible in BlockMetadata.
 *   - Category (Category-1 / Category-2 / manifest-only) lives in the
 *     spec JSON's validator contract, not in block metadata.
 *
 * The two surfaces should agree. A separate consistency check (future)
 * can verify that every (schemaId, moduleId) pair in SCHEMA_OWNERSHIP is
 * also present in some BlockMetadata.modules entry and vice versa.
 *
 * Each module self-routes by role at render time (e.g., CartModule
 * returns null when selectedRoleKind !== "buyer"). This map is therefore
 * role-agnostic; the derivation walks included schemas → collects
 * moduleIds → modules render or return null based on the active role.
 *
 * Sister-schema pairs (Category-1 ↔ Category-2):
 *   - figaro-proximity-policy-v1 ↔ figaro-proximity-proof-v1
 *   - figaro-ghg-measurement-v1 is the runtime sister to ALL five
 *     figaro-ghg-<standard>-v1 disclosure schemas (1-to-many); leave
 *     sisterSchemaId unset.
 *
 * Routes (route-tier blocks, e.g. /consent, /dispute, /evidence-display):
 *   - Not slotted via moduleSlots. Surface as links in capability-
 *     presentation rules or navigation rather than mountable modules.
 *   - The schema's `routes` field lists relevant URLs; the derivation
 *     can wire them into role-appropriate capability links.
 */

export type DrawerArticle =
    | "identity"
    | "order"
    | "fulfilment"
    | "logistics"
    | "attestations"
    | "emissions"
    | "jurisdiction"
    | "consent";

export type SchemaCategory = "category-1" | "category-2" | "manifest-only";

export interface SchemaOwnership {
    schemaId: string;
    /** Drawer article that composes this schema. Undefined when the
     *  schema is runtime-only (Category-1 sister of a Category-2 clause). */
    drawerArticle?: DrawerArticle;
    /** Mechanism kinds that claim this schema. Plural for cross-mechanism
     *  schemas (proximity-policy is committed at coordinator; its sister
     *  proof is read at attestation). Empty when the schema has no
     *  capability-dispatching mechanism (e.g., consent, jurisdiction). */
    mechanismKinds: readonly string[];
    /** Runtime view-tier modules that consume / produce this schema's
     *  data. Empty when the schema is route-tier only (e.g., consent
     *  via /consent). */
    moduleIds: readonly string[];
    /** Route-tier blocks that surface this schema. Empty when the schema
     *  is view-tier only or has no UI at all. */
    routes?: readonly string[];
    /** Sister schema that pairs with this one (Category-1 ↔ Category-2). */
    sisterSchemaId?: string;
    /** Category per the protocol-extension doctrine. */
    category: SchemaCategory;
}

export const SCHEMA_OWNERSHIP: Readonly<Record<string, SchemaOwnership>> = {
    // ── Identity (display-only) ─────────────────────────────────────────
    "figaro-topology-v1": {
        schemaId: "figaro-topology-v1",
        drawerArticle: "identity",
        mechanismKinds: ["core"],
        moduleIds: ["process-graph", "order-node"],
        category: "manifest-only",
    },

    // ── Order — cart + signature flow + merchant-side surfaces ─────────
    "figaro-commerce-v1": {
        schemaId: "figaro-commerce-v1",
        drawerArticle: "order",
        mechanismKinds: ["core"],
        moduleIds: ["cart", "incoming-orders", "merchant-fulfilment",
            "settlement-breakdown"],
        category: "category-2",
    },

    // ── Fulfilment ──────────────────────────────────────────────────────
    "figaro-fulfilment-v2": {
        schemaId: "figaro-fulfilment-v2",
        drawerArticle: "fulfilment",
        mechanismKinds: ["coordinator"],
        moduleIds: ["coordinator-actions", "handoff-details"],
        category: "category-2",
    },
    "figaro-proximity-policy-v1": {
        schemaId: "figaro-proximity-policy-v1",
        drawerArticle: "fulfilment",
        mechanismKinds: ["coordinator", "attestation"],
        moduleIds: ["coordinator-actions", "delivery-attestation"],
        sisterSchemaId: "figaro-proximity-proof-v1",
        category: "category-2",
    },
    "figaro-proximity-proof-v1": {
        schemaId: "figaro-proximity-proof-v1",
        // Runtime-only sister of proximity-policy.
        mechanismKinds: ["attestation"],
        moduleIds: ["delivery-attestation"],
        sisterSchemaId: "figaro-proximity-policy-v1",
        category: "category-1",
    },

    // ── Logistics ──────────────────────────────────────────────────────
    "figaro-geo-v2": {
        schemaId: "figaro-geo-v2",
        drawerArticle: "logistics",
        mechanismKinds: ["coordinator"],
        moduleIds: ["handoff-details", "handoff-tracker"],
        category: "category-2",
    },

    // ── Attestations (per-role sovereign event logs) ───────────────────
    "figaro-merchant-process-v1": {
        schemaId: "figaro-merchant-process-v1",
        drawerArticle: "attestations",
        mechanismKinds: ["coordinator"],
        moduleIds: ["coordinator-actions", "merchant-fulfilment"],
        category: "category-1",
    },
    "figaro-courier-process-v1": {
        schemaId: "figaro-courier-process-v1",
        drawerArticle: "attestations",
        mechanismKinds: ["coordinator"],
        moduleIds: ["coordinator-actions", "delivery-attestation"],
        category: "category-1",
    },

    // ── Emissions ──────────────────────────────────────────────────────
    "figaro-ghg-protocol-v1": {
        schemaId: "figaro-ghg-protocol-v1",
        drawerArticle: "emissions",
        mechanismKinds: ["disclosure"],
        moduleIds: ["disclosure-actions"],
        category: "category-2",
    },
    "figaro-ghg-iso-14064-v1": {
        schemaId: "figaro-ghg-iso-14064-v1",
        drawerArticle: "emissions",
        mechanismKinds: ["disclosure"],
        moduleIds: ["disclosure-actions"],
        category: "category-2",
    },
    "figaro-ghg-pas-2050-v1": {
        schemaId: "figaro-ghg-pas-2050-v1",
        drawerArticle: "emissions",
        mechanismKinds: ["disclosure"],
        moduleIds: ["disclosure-actions"],
        category: "category-2",
    },
    "figaro-ghg-en-16258-v1": {
        schemaId: "figaro-ghg-en-16258-v1",
        drawerArticle: "emissions",
        mechanismKinds: ["disclosure"],
        moduleIds: ["disclosure-actions"],
        category: "category-2",
    },
    "figaro-ghg-custom-v1": {
        schemaId: "figaro-ghg-custom-v1",
        drawerArticle: "emissions",
        mechanismKinds: ["disclosure"],
        moduleIds: ["disclosure-actions"],
        category: "category-2",
    },
    "figaro-ghg-measurement-v1": {
        schemaId: "figaro-ghg-measurement-v1",
        // Runtime sister to ALL five ghg-<standard>-v1 disclosure schemas
        // (1-to-many); sisterSchemaId intentionally left unset.
        mechanismKinds: ["disclosure"],
        moduleIds: ["disclosure-actions"],
        category: "category-1",
    },
    "figaro-offset-policy-v1": {
        schemaId: "figaro-offset-policy-v1",
        drawerArticle: "emissions",
        mechanismKinds: ["disclosure"],
        moduleIds: ["disclosure-actions"],
        category: "category-2",
    },

    // ── Jurisdiction — view-mountable three-layer panel + route flows ─
    // The dispute-status module composes all three jurisdiction layers:
    //   Layer 1 bonded settlement (kernel, always-active)
    //   Layer 2 Kleros decentralized arbitration (env-configured)
    //   Layer 3 State / ADR (applicableLaw / forum / language —
    //                        agreement-derived; display-only at runtime,
    //                        surfaces in the BoL PDF for off-chain forums).
    "figaro-jurisdiction-v1": {
        schemaId: "figaro-jurisdiction-v1",
        drawerArticle: "jurisdiction",
        mechanismKinds: [],
        moduleIds: ["dispute-status"],
        routes: ["/dispute", "/evidence-display"],
        category: "category-2",
    },

    // ── Consent — route-only onboarding gate ───────────────────────────
    "figaro-consent-v1": {
        schemaId: "figaro-consent-v1",
        drawerArticle: "consent",
        mechanismKinds: [],
        // No view-tier module. ConsentOnboardingModal is a one-time
        // onboarding gate (localStorage-keyed), not per-process.
        moduleIds: [],
        routes: ["/consent"],
        category: "category-2",
    },
};

// ── Lookup helpers ──────────────────────────────────────────────────────

/** Schemas grouped by drawer article (designer-time discovery). */
export function getSchemasForDrawerArticle(
    article: DrawerArticle,
): readonly SchemaOwnership[] {
    return Object.values(SCHEMA_OWNERSHIP).filter(
        (entry) => entry.drawerArticle === article,
    );
}

/** Runtime-only sister schemas (Category-1 paired with a Category-2). */
export function getRuntimeSisterSchemas(): readonly SchemaOwnership[] {
    return Object.values(SCHEMA_OWNERSHIP).filter(
        (entry) => entry.category === "category-1",
    );
}

/** Modules that mount when this schema is included in an agreement. */
export function getModulesForSchema(schemaId: string): readonly string[] {
    return SCHEMA_OWNERSHIP[schemaId]?.moduleIds ?? [];
}

/** Mechanism kinds an assembly should include when this schema is
 *  composed in any of its orders. Deduped across all schemas the
 *  caller passes in. */
export function getMechanismKindsForSchemas(
    schemaIds: readonly string[],
): readonly string[] {
    const kinds = new Set<string>();
    for (const schemaId of schemaIds) {
        const entry = SCHEMA_OWNERSHIP[schemaId];
        if (!entry) continue;
        for (const kind of entry.mechanismKinds) kinds.add(kind);
    }
    return Array.from(kinds);
}
