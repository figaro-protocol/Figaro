/**
 * Clause-section status — shared between the AgreementDrawer (used in its
 * pill row + minimize-rail) and ProcessGraphCanvas (used in its per-node
 * category-dot strip). Single source of truth so the dot in the canvas and
 * the dot in the drawer always agree.
 *
 * Two field maps:
 *
 *   SECTION_FIELDS  — every manifest field that belongs to a category.
 *                     Drives `clearSection` and "is any field filled" checks.
 *
 *   REQUIRED_FIELDS — required-only subset. Drives the status:
 *                     - complete: all required are filled
 *                     - partial:  some required are filled
 *                     - empty:    none filled
 *                     Optional fields (e.g., mass/volume/class on geo,
 *                     forum/language on jurisdiction) don't downgrade
 *                     `complete` to `partial`.
 */

import type { ManifestFields } from "@/lib/core/encoding";
import type { SchemaCategory } from "@/lib/shared/schemaCategories";

/**
 * Categories that have a clause editor in the AgreementDrawer AND surface as
 * a status dot on each node in the designer canvas. Order matters: it's the
 * display order for both surfaces.
 *
 * NOT included today: `commerce` (buyer-at-commit-time choice), `fulfilment`
 * (set via edge pills on the canvas), `payment`/`evidence-law` (secondary
 * tags), `lifecycle`/`role-process` (runtime-only).
 */
export const CLAUSE_CATEGORIES: readonly SchemaCategory[] = [
    "geo",
    "emissions",
    "handoff",
    "proximity",
    "jurisdiction",
    "consent",
    "topology",
];

export const SECTION_FIELDS: Record<SchemaCategory, readonly string[]> = {
    geo: ["origin", "destination", "mass", "volume", "class_"],
    emissions: ["ghgStandard", "ghgScope"],
    handoff: ["handoffMode"],
    proximity: ["proximityBand"],
    jurisdiction: ["applicableLaw", "forum", "language"],
    consent: ["documentHash", "documentVersion", "documentTitle"],
    topology: [],
    // Categories defined in the taxonomy but not rendered as drawer sections today.
    commerce: [], payment: [], "evidence-law": [], lifecycle: [],
    "role-process": [], fulfilment: [],
};

export const REQUIRED_FIELDS: Record<SchemaCategory, readonly string[]> = {
    geo: ["origin", "destination"],
    emissions: ["ghgStandard", "ghgScope"],
    handoff: ["handoffMode"],
    proximity: ["proximityBand"],
    jurisdiction: ["applicableLaw"],
    consent: ["documentHash", "documentVersion", "documentTitle"],
    topology: [],
    commerce: [], payment: [], "evidence-law": [], lifecycle: [],
    "role-process": [], fulfilment: [],
};

export type SectionStatus = "empty" | "partial" | "complete";

export function isFieldFilled(fields: ManifestFields, key: string): boolean {
    const v = (fields as Record<string, unknown>)[key];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") {
        const trimmed = v.trim();
        return trimmed !== "" && trimmed !== "—";
    }
    return true;
}

export function sectionStatus(category: SchemaCategory, fields: ManifestFields): SectionStatus {
    const required = REQUIRED_FIELDS[category];
    if (required.length === 0) return "empty";
    const filled = required.filter((f) => isFieldFilled(fields, f)).length;
    if (filled === 0) return "empty";
    if (filled === required.length) return "complete";
    return "partial";
}
