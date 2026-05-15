/**
 * Schema taxonomy — canonical categories, tiers, and lens map.
 *
 * Three parallel taxonomies organize Figaro schemas. This module is the single
 * source of truth for all three:
 *
 *   CATEGORY — drawer organization. ~13 narrow slices. Read from the
 *   `categories` array in each schema's Layer-A spec JSON. Used by the
 *   designer's `AgreementDrawer` to group schemas into sections.
 *
 *   TIER — lifecycle phase the schema attaches to. Hand-maintained
 *   (the spec JSON shape does not carry a `tier` field today):
 *     - "designer-time": clause set at agreement-creation time; lives in
 *       the agreement hash; surfaced in the designer drawer.
 *     - "runtime": attestation emitted during/after order processing;
 *       NOT surfaced in the designer drawer; lives on attestation feeds.
 *
 *   LENS — canvas overlay. 4 stable broad slices that highlight visual
 *   aspects of an order in `ProcessGraphCanvas`. Lenses are NOT
 *   category-derived — they are an independent UX surface that can bundle
 *   multiple categories under one visual filter. `LENS_TO_CATEGORIES` is
 *   the explicit map between the two taxonomies; without it the
 *   relationship is implicit and drifts.
 */

import commerceSpec from "@/lib/shared/schemas/figaro-commerce-v1.json";
import consentSpec from "@/lib/shared/schemas/figaro-consent-v1.json";
import courierProcessSpec from "@/lib/shared/schemas/figaro-courier-process-v1.json";
import fulfilmentSpec from "@/lib/shared/schemas/figaro-fulfilment-v2.json";
import geoSpec from "@/lib/shared/schemas/figaro-geo-v2.json";
import ghgCustomSpec from "@/lib/shared/schemas/figaro-ghg-custom-v1.json";
import ghgEN16258Spec from "@/lib/shared/schemas/figaro-ghg-en-16258-v1.json";
import ghgISO14064Spec from "@/lib/shared/schemas/figaro-ghg-iso-14064-v1.json";
import ghgMeasurementSpec from "@/lib/shared/schemas/figaro-ghg-measurement-v1.json";
import ghgPAS2050Spec from "@/lib/shared/schemas/figaro-ghg-pas-2050-v1.json";
import ghgProtocolSpec from "@/lib/shared/schemas/figaro-ghg-protocol-v1.json";
import jurisdictionSpec from "@/lib/shared/schemas/figaro-jurisdiction-v1.json";
import merchantProcessSpec from "@/lib/shared/schemas/figaro-merchant-process-v1.json";
import proximityPolicySpec from "@/lib/shared/schemas/figaro-proximity-policy-v1.json";
import proximityProofSpec from "@/lib/shared/schemas/figaro-proximity-proof-v1.json";
import topologySpec from "@/lib/shared/schemas/figaro-topology-v1.json";

// ── Taxonomy types ──────────────────────────────────────────────────────────

export type SchemaCategory =
    | "commerce"
    | "payment"
    | "consent"
    | "evidence-law"
    | "lifecycle"
    | "operator-process"
    | "fulfilment"
    | "geo"
    | "emissions"
    | "jurisdiction"
    | "proximity"
    | "topology";

export type SchemaTier = "designer-time" | "runtime";

export type LensId = "value" | "geo" | "capital" | "ghg";

// ── Category labels and descriptions ────────────────────────────────────────

export const CATEGORY_LABELS: Record<SchemaCategory, string> = {
    commerce: "Commerce",
    payment: "Payment",
    consent: "Consent",
    "evidence-law": "Evidence & law",
    lifecycle: "Lifecycle",
    "operator-process": "Operator process",
    fulfilment: "Fulfilment",
    geo: "Geo",
    emissions: "Emissions",
    jurisdiction: "Jurisdiction",
    proximity: "Proximity",
    topology: "Topology",
};

export const CATEGORY_DESCRIPTIONS: Record<SchemaCategory, string> = {
    commerce: "Currency, payment amount, and itemized line items.",
    payment: "Capital-flow commitments at order-commit time.",
    consent: "Cryptographic attestation to off-chain legal documents.",
    "evidence-law": "Legal evidence anchoring for off-chain forums.",
    lifecycle: "Stage progression and event streams over time.",
    "operator-process": "Sovereign event logs for off-chain operators.",
    fulfilment: "Modality, coordination, and handoff point in one clause.",
    geo: "Geographic origin and destination, plus shipment mass, volume, and class of service.",
    emissions: "GHG accounting (per industry standard or custom).",
    jurisdiction: "Off-chain dispute-resolution jurisdiction.",
    proximity: "Proximity verification policy and proof.",
    topology: "DAG lineage and parent-order relationships.",
};

// ── Per-schema tier assignment ──────────────────────────────────────────────

/**
 * Hand-maintained: schema JSONs do not (yet) carry a `tier` field. Update
 * this map when adding a new schema. Drift between this map and the
 * registry is detectable — `assertTaxonomyComplete` below throws at module
 * load if a registry schema is missing a tier assignment.
 */
export const SCHEMA_TIER_MAP: Readonly<Record<string, SchemaTier>> = {
    "figaro-commerce-v1": "designer-time",
    "figaro-consent-v1": "designer-time",
    "figaro-fulfilment-v2": "designer-time",
    "figaro-geo-v2": "designer-time",
    "figaro-ghg-custom-v1": "designer-time",
    "figaro-ghg-en-16258-v1": "designer-time",
    "figaro-ghg-iso-14064-v1": "designer-time",
    "figaro-ghg-pas-2050-v1": "designer-time",
    "figaro-ghg-protocol-v1": "designer-time",
    "figaro-jurisdiction-v1": "designer-time",
    "figaro-proximity-policy-v1": "designer-time",
    "figaro-topology-v1": "designer-time",
    "figaro-courier-process-v1": "runtime",
    "figaro-ghg-measurement-v1": "runtime",
    "figaro-merchant-process-v1": "runtime",
    "figaro-proximity-proof-v1": "runtime",
};

// ── Lens map ────────────────────────────────────────────────────────────────

/**
 * Explicit lens → category map. Lenses can bundle multiple categories under
 * one visual filter; categories can be drawer-only (no lens). `capital` has
 * no schema-driven content — it overlays on-chain bond state from the kernel,
 * not from agreement clauses.
 */
export const LENS_TO_CATEGORIES: Readonly<Record<LensId, readonly SchemaCategory[]>> = {
    value: ["commerce", "payment"],
    geo: ["geo", "fulfilment"],
    capital: [],
    ghg: ["emissions"],
};

// ── Schema-index derivation from Layer-A spec JSONs ─────────────────────────

type SchemaSpecMeta = { readonly schemaId: string; readonly categories: readonly string[] };

const ALL_SPECS: readonly SchemaSpecMeta[] = [
    commerceSpec,
    consentSpec,
    courierProcessSpec,
    fulfilmentSpec,
    geoSpec,
    ghgCustomSpec,
    ghgEN16258Spec,
    ghgISO14064Spec,
    ghgMeasurementSpec,
    ghgPAS2050Spec,
    ghgProtocolSpec,
    jurisdictionSpec,
    merchantProcessSpec,
    proximityPolicySpec,
    proximityProofSpec,
    topologySpec,
] as readonly SchemaSpecMeta[];

const ALL_CATEGORIES: readonly SchemaCategory[] = Object.keys(CATEGORY_LABELS) as SchemaCategory[];

function buildIndex(filter?: (spec: SchemaSpecMeta) => boolean): Readonly<Record<SchemaCategory, readonly string[]>> {
    const index = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, [] as string[]])) as Record<SchemaCategory, string[]>;
    for (const spec of ALL_SPECS) {
        if (filter && !filter(spec)) continue;
        for (const cat of spec.categories) {
            if (cat in index) {
                index[cat as SchemaCategory].push(spec.schemaId);
            }
        }
    }
    return index;
}

/** Every schema, grouped by category. Includes both designer-time and runtime. */
export const SCHEMAS_BY_CATEGORY: Readonly<Record<SchemaCategory, readonly string[]>> = buildIndex();

/** Only designer-time schemas, grouped by category. Drives the AgreementDrawer sections. */
export const DESIGNER_SCHEMAS_BY_CATEGORY: Readonly<Record<SchemaCategory, readonly string[]>> = buildIndex(
    (spec) => SCHEMA_TIER_MAP[spec.schemaId] === "designer-time",
);

/** Only runtime schemas, grouped by category. */
export const RUNTIME_SCHEMAS_BY_CATEGORY: Readonly<Record<SchemaCategory, readonly string[]>> = buildIndex(
    (spec) => SCHEMA_TIER_MAP[spec.schemaId] === "runtime",
);

// ── Lookup helpers ──────────────────────────────────────────────────────────

/** Primary category for a schema — the first entry in its `categories` array. */
export function getPrimaryCategory(schemaId: string): SchemaCategory | undefined {
    const spec = ALL_SPECS.find((s) => s.schemaId === schemaId);
    if (!spec || spec.categories.length === 0) return undefined;
    const first = spec.categories[0];
    return first in CATEGORY_LABELS ? (first as SchemaCategory) : undefined;
}

/** Tier for a schema; throws if the schema isn't in the tier map. */
export function getSchemaTier(schemaId: string): SchemaTier {
    const tier = SCHEMA_TIER_MAP[schemaId];
    if (!tier) {
        throw new Error(`Schema "${schemaId}" has no tier assignment in SCHEMA_TIER_MAP. Add it to schemaCategories.ts.`);
    }
    return tier;
}

/** Lens that surfaces a given category, or undefined if the category is drawer-only. */
export function getLensForCategory(category: SchemaCategory): LensId | undefined {
    for (const lens of Object.keys(LENS_TO_CATEGORIES) as LensId[]) {
        if (LENS_TO_CATEGORIES[lens].includes(category)) return lens;
    }
    return undefined;
}

/**
 * `title` and `description` for a schema, read directly from its Layer-A
 * spec JSON. Used by the AgreementDrawer to render each article's prose
 * (title + one-line description) without duplicating spec text in UI
 * code. Returns undefined when the schemaId is unknown.
 */
export function getSchemaInfo(schemaId: string): { title: string; description: string } | undefined {
    const spec = ALL_SPECS.find((s) => s.schemaId === schemaId) as
        | (SchemaSpecMeta & { title?: string; description?: string })
        | undefined;
    if (!spec) return undefined;
    return {
        title: spec.title ?? schemaId,
        description: spec.description ?? "",
    };
}

/** Categories that have at least one designer-time schema (drawer-renderable). */
export function getDesignerCategories(): readonly SchemaCategory[] {
    return ALL_CATEGORIES.filter((c) => DESIGNER_SCHEMAS_BY_CATEGORY[c].length > 0);
}

// ── Drift detection ─────────────────────────────────────────────────────────

/**
 * Validates that every schema in the registry has a tier assignment and that
 * its `categories` field declares at least one recognized category. Runs at
 * module load so drift surfaces as a build/dev-server error, not as a silent
 * UI gap.
 */
function assertTaxonomyComplete(): void {
    const missingTier: string[] = [];
    const unknownCategories: Array<{ schemaId: string; category: string }> = [];
    for (const spec of ALL_SPECS) {
        if (!(spec.schemaId in SCHEMA_TIER_MAP)) {
            missingTier.push(spec.schemaId);
        }
        for (const cat of spec.categories) {
            if (!(cat in CATEGORY_LABELS)) {
                unknownCategories.push({ schemaId: spec.schemaId, category: cat });
            }
        }
    }
    if (missingTier.length > 0) {
        throw new Error(
            `schemaCategories.ts: missing tier assignment for ${missingTier.join(", ")}. Add to SCHEMA_TIER_MAP.`,
        );
    }
    if (unknownCategories.length > 0) {
        const detail = unknownCategories.map((u) => `${u.schemaId}:${u.category}`).join(", ");
        throw new Error(
            `schemaCategories.ts: unrecognized category in spec JSON: ${detail}. Add to SchemaCategory union and CATEGORY_LABELS.`,
        );
    }
}

assertTaxonomyComplete();
