/**
 * Clause taxonomy — tiers, families, info, and the canvas lens id.
 *
 *   TIER — `CLAUSE_TIER_MAP`: "designer-time" (set at design, in the agreement
 *   hash, shown in the drawer) vs "runtime" (attested during/after the process).
 *   Read by `GHGAnchorPanel`. NOTE: each spec already carries this in
 *   `block.tier` ("category-1" ⇒ runtime, else designer-time); collapsing the
 *   hand map onto `block.tier` is open work — do not add a parallel.
 *
 *   FAMILY — `CLAUSE_FAMILY_MAP`: the coarse editorial grouping the `/clauses`
 *   inventory renders.
 *
 *   INFO — `getClauseInfo`: title + description, read from the spec JSON.
 *
 *   LENS — `LensId`: the four canvas overlays in `ProcessGraphCanvas`.
 *
 * The "category" grouping (`CLAUSES_BY_CATEGORY`, the designer/runtime indexes,
 * `getPrimaryCategory`, `getLensForCategory`, `LENS_TO_CATEGORIES`) was deleted
 * 2026-06-01 — it was a dead parallel of the drawer's `block.drawerArticle`
 * grouping with zero consumers. "category" and "article" are synonyms for the
 * group a clause is read under; the spec-resident source is `block.drawerArticle`.
 * Do not reintroduce a `categories`-based grouping here.
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

export type ClauseTier = "designer-time" | "runtime";

/** Canvas lens identifiers (ProcessGraphCanvas overlay). */
export type LensId = "value" | "geo" | "capital" | "ghg";

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

// ── Clause-index derivation from Layer-A spec JSONs ─────────────────────────

type ClauseSpecMeta = { readonly clauseId: string };

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

// ── Lookup helpers ──────────────────────────────────────────────────────────

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
 * Validates that every clause in the registry has a tier and a family
 * assignment. Runs at module load so drift surfaces as a build/dev-server
 * error, not as a silent UI gap.
 */
function assertTaxonomyComplete(): void {
    const missingTier: string[] = [];
    const missingFamily: string[] = [];
    for (const spec of ALL_SPECS) {
        if (!(spec.clauseId in CLAUSE_TIER_MAP)) {
            missingTier.push(spec.clauseId);
        }
        if (!(spec.clauseId in CLAUSE_FAMILY_MAP)) {
            missingFamily.push(spec.clauseId);
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
}

assertTaxonomyComplete();
