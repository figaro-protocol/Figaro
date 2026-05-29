/**
 * Clause taxonomy — canonical categories, tiers, families, and lens map.
 *
 * Four parallel taxonomies organize Figaro clauses. This module is the single
 * source of truth for all four:
 *
 *   CATEGORY — drawer organization. ~13 narrow slices. Read from the
 *   `categories` array in each clause's Layer-A spec JSON. Used by the
 *   designer's `AgreementDrawer` to group clauses into sections.
 *
 *   TIER — lifecycle phase the clause attaches to. Hand-maintained
 *   (the spec JSON shape does not carry a `tier` field today):
 *     - "designer-time": clause set at agreement-creation time; lives in
 *       the agreement hash; surfaced in the designer drawer.
 *     - "runtime": attestation emitted during/after order processing;
 *       NOT surfaced in the designer drawer; lives on attestation feeds.
 *
 *   FAMILY — the coarse editorial grouping the `/clauses` inventory
 *   renders. Six families, hand-maintained (the spec JSON shape carries
 *   no `family` field); `CLAUSE_FAMILY_MAP` is the assignment.
 *
 *   LENS — canvas overlay. 4 stable broad slices that highlight visual
 *   aspects of an order in `ProcessGraphCanvas`. Lenses are NOT
 *   category-derived — they are an independent UX surface that can bundle
 *   multiple categories under one visual filter. `LENS_TO_CATEGORIES` is
 *   the explicit map between the two taxonomies; without it the
 *   relationship is implicit and drifts.
 */

import commerceSpec from "@/lib/shared/clauses/figaro-commerce-v1.json";
import consentSpec from "@/lib/shared/clauses/figaro-consent-v1.json";
import courierProcessSpec from "@/lib/shared/clauses/figaro-courier-process-v1.json";
import fulfilmentSpec from "@/lib/shared/clauses/figaro-fulfilment-v2.json";
import geoSpec from "@/lib/shared/clauses/figaro-geo-v2.json";
import ghgCustomSpec from "@/lib/shared/clauses/figaro-ghg-custom-v1.json";
import ghgEN16258Spec from "@/lib/shared/clauses/figaro-ghg-en-16258-v1.json";
import ghgISO14064Spec from "@/lib/shared/clauses/figaro-ghg-iso-14064-v1.json";
import ghgMeasurementSpec from "@/lib/shared/clauses/figaro-ghg-measurement-v1.json";
import ghgPAS2050Spec from "@/lib/shared/clauses/figaro-ghg-pas-2050-v1.json";
import ghgProtocolSpec from "@/lib/shared/clauses/figaro-ghg-protocol-v1.json";
import applicableLawSpec from "@/lib/shared/clauses/figaro-applicable-law-v1.json";
import arbitrationKlerosSpec from "@/lib/shared/clauses/figaro-arbitration-kleros-v1.json";
import merchantProcessSpec from "@/lib/shared/clauses/figaro-merchant-process-v1.json";
import offsetPolicySpec from "@/lib/shared/clauses/figaro-offset-policy-v1.json";
import proximityPolicySpec from "@/lib/shared/clauses/figaro-proximity-policy-v1.json";
import proximityProofSpec from "@/lib/shared/clauses/figaro-proximity-proof-v1.json";
import topologySpec from "@/lib/shared/clauses/figaro-topology-v1.json";

// ── Taxonomy types ──────────────────────────────────────────────────────────

export type ClauseCategory =
    | "commerce"
    | "payment"
    | "consent"
    | "evidence-law"
    | "lifecycle"
    | "seller-process"
    | "fulfilment"
    | "geo"
    | "emissions"
    | "jurisdiction"
    | "arbitration"
    | "proximity"
    | "topology";

export type ClauseTier = "designer-time" | "runtime";

export type LensId = "value" | "geo" | "capital" | "ghg";

// ── Category labels and descriptions ────────────────────────────────────────

export const CATEGORY_LABELS: Record<ClauseCategory, string> = {
    commerce: "Commerce",
    payment: "Payment",
    consent: "Consent",
    "evidence-law": "Evidence & law",
    lifecycle: "Lifecycle",
    "seller-process": "Seller process",
    fulfilment: "Fulfilment",
    geo: "Geo",
    emissions: "Emissions",
    jurisdiction: "Jurisdiction",
    arbitration: "Arbitration",
    proximity: "Proximity",
    topology: "Topology",
};

export const CATEGORY_DESCRIPTIONS: Record<ClauseCategory, string> = {
    commerce: "Currency, payment amount, and itemized line items.",
    payment: "Capital-flow commitments at order-commit time.",
    consent: "Cryptographic attestation to off-chain legal documents.",
    "evidence-law": "Legal evidence anchoring for off-chain forums.",
    lifecycle: "Stage progression and event streams over time.",
    "seller-process": "Sovereign event logs for off-chain sellers.",
    fulfilment: "Modality, coordination, and handoff point in one clause.",
    geo: "Geographic origin and destination, plus shipment mass, volume, and class of service.",
    emissions: "GHG accounting (per industry standard or custom).",
    jurisdiction: "State / ADR / traditional-jurisdiction recourse layer.",
    arbitration: "Decentralized off-chain arbitration via Kleros or another provider.",
    proximity: "Proximity verification policy and proof.",
    topology: "DAG lineage and parent-order relationships.",
};

// ── Per-clause tier assignment ──────────────────────────────────────────────

/**
 * Hand-maintained: clause JSONs do not (yet) carry a `tier` field. Update
 * this map when adding a new clause. Drift between this map and the
 * registry is detectable — `assertTaxonomyComplete` below throws at module
 * load if a registry clause is missing a tier assignment.
 */
export const CLAUSE_TIER_MAP: Readonly<Record<string, ClauseTier>> = {
    "figaro-commerce-v1": "designer-time",
    "figaro-consent-v1": "designer-time",
    "figaro-fulfilment-v2": "designer-time",
    "figaro-geo-v2": "designer-time",
    "figaro-ghg-custom-v1": "designer-time",
    "figaro-ghg-en-16258-v1": "designer-time",
    "figaro-ghg-iso-14064-v1": "designer-time",
    "figaro-ghg-pas-2050-v1": "designer-time",
    "figaro-ghg-protocol-v1": "designer-time",
    "figaro-applicable-law-v1": "designer-time",
    "figaro-arbitration-kleros-v1": "designer-time",
    "figaro-offset-policy-v1": "designer-time",
    "figaro-proximity-policy-v1": "designer-time",
    "figaro-topology-v1": "designer-time",
    "figaro-courier-process-v1": "runtime",
    "figaro-ghg-measurement-v1": "runtime",
    "figaro-merchant-process-v1": "runtime",
    "figaro-proximity-proof-v1": "runtime",
};

// ── Per-clause family assignment ────────────────────────────────────────────

/**
 * FAMILY — the coarse editorial grouping the /clauses inventory renders. Six
 * families, hand-maintained (the spec JSON shape carries no `family` field).
 * `assertTaxonomyComplete` below throws at module load if a registry clause is
 * missing a family, so the inventory cannot silently drop a clause.
 */
export type ClauseFamily =
    | "manifest"
    | "commerce"
    | "emissions"
    | "lifecycle-proximity"
    | "process-logs"
    | "legal";

export const CLAUSE_FAMILY_LABELS: Record<ClauseFamily, string> = {
    manifest: "Manifest",
    commerce: "Commerce primitives",
    emissions: "Emissions",
    "lifecycle-proximity": "Lifecycle and proximity",
    "process-logs": "Sovereign process logs",
    legal: "Legal anchoring",
};

/** Render order for the /clauses inventory. */
export const CLAUSE_FAMILY_ORDER: readonly ClauseFamily[] = [
    "manifest",
    "commerce",
    "emissions",
    "lifecycle-proximity",
    "process-logs",
    "legal",
];

export const CLAUSE_FAMILY_MAP: Readonly<Record<string, ClauseFamily>> = {
    "figaro-topology-v1": "manifest",
    "figaro-commerce-v1": "commerce",
    "figaro-geo-v2": "commerce",
    "figaro-fulfilment-v2": "commerce",
    "figaro-ghg-protocol-v1": "emissions",
    "figaro-ghg-iso-14064-v1": "emissions",
    "figaro-ghg-pas-2050-v1": "emissions",
    "figaro-ghg-en-16258-v1": "emissions",
    "figaro-ghg-custom-v1": "emissions",
    "figaro-ghg-measurement-v1": "emissions",
    "figaro-offset-policy-v1": "emissions",
    "figaro-proximity-policy-v1": "lifecycle-proximity",
    "figaro-proximity-proof-v1": "lifecycle-proximity",
    "figaro-merchant-process-v1": "process-logs",
    "figaro-courier-process-v1": "process-logs",
    "figaro-applicable-law-v1": "legal",
    "figaro-arbitration-kleros-v1": "legal",
    "figaro-consent-v1": "legal",
};

// ── Lens map ────────────────────────────────────────────────────────────────

/**
 * Explicit lens → category map. Lenses can bundle multiple categories under
 * one visual filter; categories can be drawer-only (no lens). `capital` has
 * no clause-driven content — it overlays on-chain bond state from the kernel,
 * not from agreement clauses.
 */
export const LENS_TO_CATEGORIES: Readonly<Record<LensId, readonly ClauseCategory[]>> = {
    value: ["commerce", "payment"],
    geo: ["geo", "fulfilment"],
    capital: [],
    ghg: ["emissions"],
};

// ── Clause-index derivation from Layer-A spec JSONs ─────────────────────────

type ClauseSpecMeta = { readonly clauseId: string; readonly categories: readonly string[] };

const ALL_SPECS: readonly ClauseSpecMeta[] = [
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
    applicableLawSpec,
    arbitrationKlerosSpec,
    merchantProcessSpec,
    offsetPolicySpec,
    proximityPolicySpec,
    proximityProofSpec,
    topologySpec,
] as readonly ClauseSpecMeta[];

const ALL_CATEGORIES: readonly ClauseCategory[] = Object.keys(CATEGORY_LABELS) as ClauseCategory[];

function buildIndex(filter?: (spec: ClauseSpecMeta) => boolean): Readonly<Record<ClauseCategory, readonly string[]>> {
    const index = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, [] as string[]])) as Record<ClauseCategory, string[]>;
    for (const spec of ALL_SPECS) {
        if (filter && !filter(spec)) continue;
        for (const cat of spec.categories) {
            if (cat in index) {
                index[cat as ClauseCategory].push(spec.clauseId);
            }
        }
    }
    return index;
}

/** Every clause, grouped by category. Includes both designer-time and runtime. */
export const CLAUSES_BY_CATEGORY: Readonly<Record<ClauseCategory, readonly string[]>> = buildIndex();

/** Only designer-time clauses, grouped by category. Drives the AgreementDrawer sections. */
export const DESIGNER_CLAUSES_BY_CATEGORY: Readonly<Record<ClauseCategory, readonly string[]>> = buildIndex(
    (spec) => CLAUSE_TIER_MAP[spec.clauseId] === "designer-time",
);

/** Only runtime clauses, grouped by category. */
export const RUNTIME_CLAUSES_BY_CATEGORY: Readonly<Record<ClauseCategory, readonly string[]>> = buildIndex(
    (spec) => CLAUSE_TIER_MAP[spec.clauseId] === "runtime",
);

// ── Lookup helpers ──────────────────────────────────────────────────────────

/** Primary category for a clause — the first entry in its `categories` array. */
export function getPrimaryCategory(clauseId: string): ClauseCategory | undefined {
    const spec = ALL_SPECS.find((s) => s.clauseId === clauseId);
    if (!spec || spec.categories.length === 0) return undefined;
    const first = spec.categories[0];
    return first in CATEGORY_LABELS ? (first as ClauseCategory) : undefined;
}

/** Tier for a clause; throws if the clause isn't in the tier map. */
export function getClauseTier(clauseId: string): ClauseTier {
    const tier = CLAUSE_TIER_MAP[clauseId];
    if (!tier) {
        throw new Error(`Clause "${clauseId}" has no tier assignment in CLAUSE_TIER_MAP. Add it to clauseCategories.ts.`);
    }
    return tier;
}

/** Lens that surfaces a given category, or undefined if the category is drawer-only. */
export function getLensForCategory(category: ClauseCategory): LensId | undefined {
    for (const lens of Object.keys(LENS_TO_CATEGORIES) as LensId[]) {
        if (LENS_TO_CATEGORIES[lens].includes(category)) return lens;
    }
    return undefined;
}

/**
 * `title` and `description` for a clause, read directly from its Layer-A
 * spec JSON. Used by the AgreementDrawer to render each article's prose
 * (title + one-line description) without duplicating spec text in UI
 * code. Returns undefined when the clauseId is unknown.
 */
export function getClauseInfo(clauseId: string): { title: string; description: string } | undefined {
    const spec = ALL_SPECS.find((s) => s.clauseId === clauseId) as
        | (ClauseSpecMeta & { title?: string; description?: string })
        | undefined;
    if (!spec) return undefined;
    return {
        title: spec.title ?? clauseId,
        description: spec.description ?? "",
    };
}

/** Categories that have at least one designer-time clause (drawer-renderable). */
export function getDesignerCategories(): readonly ClauseCategory[] {
    return ALL_CATEGORIES.filter((c) => DESIGNER_CLAUSES_BY_CATEGORY[c].length > 0);
}

// ── Inventory derivation (by family) ────────────────────────────────────────

export interface ClauseInventoryEntry {
    clauseId: string;
    title: string;
    description: string;
}

export interface ClauseFamilyGroup {
    family: ClauseFamily;
    label: string;
    clauses: readonly ClauseInventoryEntry[];
}

/**
 * Every clause grouped into its editorial family, in render order. Drives the
 * /clauses inventory — list, titles, and descriptions all derive from the
 * Layer-A spec JSONs, so a new clause JSON appears automatically.
 */
export const CLAUSES_BY_FAMILY: readonly ClauseFamilyGroup[] = CLAUSE_FAMILY_ORDER.map(
    (family) => ({
        family,
        label: CLAUSE_FAMILY_LABELS[family],
        clauses: ALL_SPECS.filter((s) => CLAUSE_FAMILY_MAP[s.clauseId] === family).map((s) => {
            const info = getClauseInfo(s.clauseId);
            return {
                clauseId: s.clauseId,
                title: info?.title ?? s.clauseId,
                description: info?.description ?? "",
            };
        }),
    }),
);

/** Total clause count, derived from the registry. */
export const CLAUSE_COUNT: number = ALL_SPECS.length;

// ── Drift detection ─────────────────────────────────────────────────────────

/**
 * Validates that every clause in the registry has a tier assignment and that
 * its `categories` field declares at least one recognized category. Runs at
 * module load so drift surfaces as a build/dev-server error, not as a silent
 * UI gap.
 */
function assertTaxonomyComplete(): void {
    const missingTier: string[] = [];
    const missingFamily: string[] = [];
    const unknownCategories: Array<{ clauseId: string; category: string }> = [];
    for (const spec of ALL_SPECS) {
        if (!(spec.clauseId in CLAUSE_TIER_MAP)) {
            missingTier.push(spec.clauseId);
        }
        if (!(spec.clauseId in CLAUSE_FAMILY_MAP)) {
            missingFamily.push(spec.clauseId);
        }
        for (const cat of spec.categories) {
            if (!(cat in CATEGORY_LABELS)) {
                unknownCategories.push({ clauseId: spec.clauseId, category: cat });
            }
        }
    }
    if (missingTier.length > 0) {
        throw new Error(
            `clauseCategories.ts: missing tier assignment for ${missingTier.join(", ")}. Add to CLAUSE_TIER_MAP.`,
        );
    }
    if (missingFamily.length > 0) {
        throw new Error(
            `clauseCategories.ts: missing family assignment for ${missingFamily.join(", ")}. Add to CLAUSE_FAMILY_MAP.`,
        );
    }
    if (unknownCategories.length > 0) {
        const detail = unknownCategories.map((u) => `${u.clauseId}:${u.category}`).join(", ");
        throw new Error(
            `clauseCategories.ts: unrecognized category in spec JSON: ${detail}. Add to ClauseCategory union and CATEGORY_LABELS.`,
        );
    }
}

assertTaxonomyComplete();
