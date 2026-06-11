import type { ClauseFields } from "@/lib/core/encoding";
import {
    type AgreementLineItem,
    type AnyAgreementSection,
    buildAgreement,
    computeAgreementHash,
    isRedactedSection,
    type Agreement,
    type AgreementSection,
    type RedactableAgreement,
    type TopologyMode,
} from "@/lib/core/agreement";
import { validateContent, type FieldSpec } from "@figaro/core/clauses";
import { clauseDeclaresField, clauseIsStructural, getClauseSpec, listKnownClauseIds } from "@/lib/shared/clauseSpecSource";

// ── Multi-valued fulfilment + proximity composition ────────────────────────
//
// The drawer composes a per-node agreement by toggling sets of options into
// the clauseFields object. Two array fields drive fulfilment (modalities,
// coordinations, handoffPoints) and one drives proximity (bands). Empty
// (or absent) array = clause not in the agreement.

/** Canonical method strings used by single-selection consumers (canvas edge
 *  pill, cart, swap-mechanism flow). Each value collapses a v2 (modality,
 *  coordination) pair to a single string. */
const CANONICAL_FULFILMENT_METHODS_LIST = [
    "consume-onsite",
    "pickup",
    "virtual",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
] as const;

export type CanonicalFulfilmentMethod = typeof CANONICAL_FULFILMENT_METHODS_LIST[number];

/** Collapse the SINGLE-SELECT modality + coordination clause values into the
 *  canonical compound method string downstream consumers key on (cart,
 *  discovery filters, assembly bindings). The clauses are single-select by
 *  design — variety is the seller's array of assemblies — so the inputs are
 *  scalars: the modality clause's `modality` value and (for delivery) the
 *  coordination clause's `coordination` value. Returns null when modality is
 *  absent/unrecognized, or delivery arrives without a coordination. */
export function deriveCanonicalFulfilmentMethod(
    modality: string | undefined,
    coordination: string | undefined,
): CanonicalFulfilmentMethod | null {
    if (!modality) return null;
    if (modality === "consume-onsite") return "consume-onsite";
    if (modality === "pickup") return "pickup";
    if (modality === "virtual") return "virtual";
    if (modality === "delivery") {
        if (coordination === "buyer-assigned") return "deliver:buyer-assigned";
        if (coordination === "seller-assigned") return "deliver:seller-assigned";
        if (coordination === "dutch-auction") return "deliver:dutch-auction";
        return null;
    }
    return null;
}

function dedupeOrderHashes(orderHashes?: string[]): string[] {
    return [...new Set((orderHashes ?? []).map((hash) => hash.trim()).filter(Boolean))];
}

export interface BuildOrderAgreementParams {
    buyer: `0x${string}`;
    seller: `0x${string}`;
    currency: `0x${string}`;
    payment: bigint;
    lineItems?: AgreementLineItem[];
    clauseFields?: ClauseFields;
    parentOrderHashes?: string[];
    fallbackParentOrderHashes?: string[];
    extraSections?: AgreementSection[];
}

export interface AgreementSummary {
    geo?: {
        origin?: string;
        destination?: string;
        mass?: string | number;
        volume?: string | number;
        classOfService?: string;
    };
    topology?: {
        topologyMode: TopologyMode;
        parentOrderHashes: string[];
    };
    fulfilment?: {
        /** The order's single-select modality (the modality clause's value). */
        modality?: string;
        /** The single-select coordination (its own clause; present on
         *  delivery parent orders). */
        coordination?: string;
        /** Canonical compound method — modality, refined by coordination for
         *  delivery. null when modality is absent/unrecognized or delivery
         *  arrives without coordination. */
        method: CanonicalFulfilmentMethod | null;
    };
    /** Hand-off points (its own clause now — present on any order with a physical
     *  exchange, including a bare courier order that carries no fulfilment). */
    handoff?: {
        points: readonly string[];
    };
    ghg?: {
        /** clauseIds of each GHG disclosure section in the agreement — the
         *  clauses that declare a `scope` field. Multi-valued: one section per
         *  accounting standard the seller reports under. */
        clauseKeys: readonly string[];
        /** Label of the first declared standard — the registered spec's title
         *  (the network-defined SSoT). */
        standard?: string;
        /** Scope from the first declared standard (back-compat). */
        scope?: number;
    };
}

/** Fold the order's STRUCTURAL clauses into its clause set. A structural clause
 *  (spec `block.structural`) is composed on every order by the build itself —
 *  its data is the order's structural properties (payment/currency; DAG
 *  position), never drawer composition. The binding is BY FIELD NAME: each
 *  structural spec draws exactly the fields it declares from the builder's
 *  value bag (currency, payment, lineItems, topologyMode, parentOrderHashes),
 *  so a structural clause this codebase has never seen composes the subset it
 *  asks for — no clause is named. Topology mode is derived from the parent
 *  set. Every OTHER clause is already composed in `clauseFields`; from here
 *  all sections are projected by the same generic loop. */
function composeOrderClauseFields(params: BuildOrderAgreementParams): ClauseFields {
    const explicit = dedupeOrderHashes(params.parentOrderHashes);
    const fallback = dedupeOrderHashes(params.fallbackParentOrderHashes);
    const parents = explicit.length > 0 ? explicit : fallback;
    const topologyMode: TopologyMode =
        parents.length === 0 ? "root" : explicit.length > 0 ? "explicit" : "linear-fallback";

    const bag: Record<string, unknown> = {
        currency: params.currency,
        payment: params.payment.toString(),
        lineItems: params.lineItems ?? [],
        topologyMode,
        parentOrderHashes: parents,
    };

    const structuralIds = listKnownClauseIds().filter((clauseId) => clauseIsStructural(clauseId));
    if (structuralIds.length === 0) {
        // Without the chain→IPFS spec cache the structural sections (the
        // order's payment + DAG position) cannot compose — refuse loudly
        // rather than build a hollow agreement. Surfaces gate on
        // `useClauseSpecs().loaded`; tests prime the cache.
        throw new Error(
            "clause specs not loaded: no structural clauses in the cache — gate the surface on useClauseSpecs().loaded (or prime the spec cache in tests) before building agreements",
        );
    }

    const out: ClauseFields = { ...(params.clauseFields ?? {}) };
    for (const clauseId of structuralIds) {
        const fields = getClauseSpec(clauseId)?.fields ?? [];
        out[clauseId] = Object.fromEntries(
            fields.filter((f) => f.name in bag).map((f) => [f.name, bag[f.name]]),
        );
    }
    return out;
}

// ── Generic spec-driven field encode ────────────────────────────────────────
//
// ONE walk replaces the retired per-clause encoder map: every rule it applies
// — enum membership (minus the spec's `sentinel`), `default` fill for absent
// input, integer range coercion, required-field drop semantics, minItems
// gates, object recursion — is read from the clause's chain-loaded spec.
// No clause is named. The build encoder shapes input; full constraint
// enforcement (lengths, patterns) stays with Layer-A `validateContent` at
// the sign gates.

/** Encode one input value against its FieldSpec. `undefined` = unsatisfiable
 *  (absent/invalid with no default): the caller omits optional fields and
 *  drops the whole section for required ones. */
function encodeFieldFromSpec(field: FieldSpec, raw: unknown): unknown {
    switch (field.type) {
        case "string": {
            const s = typeof raw === "string" ? raw.trim() : "";
            return s !== "" ? s : field.default;
        }
        case "integer": {
            const n = typeof raw === "number" ? raw : raw != null && raw !== "" ? Number(raw) : NaN;
            const valid = Number.isInteger(n)
                && (field.min === undefined || n >= field.min)
                && (field.max === undefined || n <= field.max);
            return valid ? n : field.default;
        }
        case "bigint": {
            if (typeof raw === "string" && raw !== "") {
                try {
                    BigInt(raw);
                    return raw;
                } catch { /* invalid — fall through to default */ }
            }
            return field.default;
        }
        case "boolean":
            return typeof raw === "boolean" ? raw : field.default;
        case "enum": {
            const valid = typeof raw === "string" && field.values.includes(raw) && raw !== field.sentinel;
            return valid ? raw : field.default;
        }
        case "array": {
            const items = (Array.isArray(raw) ? raw : [])
                .map((v) => encodeFieldFromSpec(field.items, v))
                .filter((v) => v !== undefined);
            if (items.length === 0 || items.length < (field.minItems ?? 0)) return field.default;
            return items;
        }
        case "object": {
            if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
            const nested = encodeClauseDataFromSpec(field.fields, raw as Record<string, unknown>);
            return nested === null ? undefined : nested;
        }
    }
}

/** Project composed input through a spec's field list. `null` = a required
 *  field ended unsatisfiable — the clause's section is dropped (matching the
 *  old per-clause encoders' empty/invalid → no-section behavior). */
function encodeClauseDataFromSpec(
    fields: readonly FieldSpec[],
    input: Record<string, unknown>,
): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
        const value = encodeFieldFromSpec(field, input[field.name]);
        if (value === undefined) {
            if (field.required) return null;
            continue;
        }
        out[field.name] = value;
    }
    return out;
}

export function buildOrderAgreement(params: BuildOrderAgreementParams): Agreement {
    // The agreement is a GENERIC projection over the order's clause set. The two
    // structural clauses (commerce + topology) are folded in by
    // composeOrderClauseFields; every other clause is whatever the assembly
    // composed, INCLUDING permissionlessly-registered clauses this code has
    // never heard of — those pass through verbatim. Sections are sorted by
    // clause key so the pinned JSON is deterministic; the merkle root sorts
    // its own leaves, so order never affects agreementHash.
    const cf: ClauseFields = composeOrderClauseFields(params);

    // Project every clause in the set through ONE spec-driven walk:
    //   - unknown spec (permissionless / not yet loaded) → fields verbatim;
    //   - Category-1 → EMPTY anchor (an event-log clause's fields are filled
    //     at runtime via attestation, never composed at build);
    //   - structural (commerce, topology) → verbatim — their data is assembled
    //     by this build itself, already canonical;
    //   - everything else → encodeClauseDataFromSpec (the generic walk).
    const sections: AgreementSection[] = [];
    for (const clauseId of Object.keys(cf)) {
        const fields = (cf[clauseId] ?? {}) as Record<string, unknown>;
        const spec = getClauseSpec(clauseId);
        let data: Record<string, unknown> | null;
        if (!spec) {
            data = fields;
        } else if (spec.block?.tier === "category-1") {
            data = {};
        } else if (clauseIsStructural(clauseId)) {
            data = fields;
        } else {
            data = encodeClauseDataFromSpec(spec.fields, fields);
        }
        if (data === null) continue;
        sections.push({ clause: clauseId, data });
    }

    // Companion (sister) runtime anchors. A composed clause whose spec declares
    // a Category-1 `sisterClauseId` pairs with that runtime clause; at build the
    // sister is an EMPTY anchor — its content is attested at runtime, never
    // composed. Emitted generically from the spec (the SSoT for the pairing),
    // not per-clause companion code. Deduped: a sister shared by several composed
    // clauses, or already present, is emitted once. Triggers IFF the parent
    // produced a section (so a dropped clause carries no orphan companion).
    const composedClauseIds = sections.map((s) => s.clause);
    const emittedClauses = new Set(composedClauseIds);
    for (const clauseId of composedClauseIds) {
        const sister = getClauseSpec(clauseId)?.block?.sisterClauseId;
        if (!sister || emittedClauses.has(sister)) continue;
        if (getClauseSpec(sister)?.block?.tier !== "category-1") continue;
        sections.push({ clause: sister, data: {} });
        emittedClauses.add(sister);
    }

    if (params.extraSections?.length) {
        sections.push(...params.extraSections);
    }

    // Deterministic, permissionless-safe order. The merkle root sorts its own
    // leaves, so this only fixes the pinned-JSON byte order.
    sections.sort((a, b) => (a.clause < b.clause ? -1 : a.clause > b.clause ? 1 : 0));

    return buildAgreement({
        buyer: params.buyer,
        seller: params.seller,
        sections,
    });
}

/** Every agreement section whose registered spec declares a top-level field
 *  named `fieldName` (falling back to data-key presence for clauses whose spec
 *  isn't cached). Field names — not clause ids — are the binding vocabulary:
 *  ANY registered clause that carries the field participates, including
 *  clauses this codebase has never seen. */
export function sectionsByField(agreement: Agreement, fieldName: string): AgreementSection[] {
    return agreement.sections.filter((section) => {
        if (getClauseSpec(section.clause)) return clauseDeclaresField(section.clause, fieldName);
        return Object.prototype.hasOwnProperty.call(section.data ?? {}, fieldName);
    });
}

export function sectionByField(agreement: Agreement, fieldName: string): AgreementSection | undefined {
    return sectionsByField(agreement, fieldName)[0];
}

/** Redactable-aware sibling of `sectionsByField`: every section — cleartext
 *  OR redacted — whose registered spec declares `fieldName` (data-key
 *  fallback applies only to cleartext sections, where data is readable). */
export function findAnySectionsByField(
    agreement: Agreement | RedactableAgreement,
    fieldName: string,
): AnyAgreementSection[] {
    return agreement.sections.filter((s) => {
        if (getClauseSpec(s.clause)) return clauseDeclaresField(s.clause, fieldName);
        return !isRedactedSection(s) && Object.prototype.hasOwnProperty.call(s.data ?? {}, fieldName);
    });
}

/** Redactable-aware sibling of `sectionByField`, returning only the cleartext
 *  form: the first section declaring `fieldName` that is NOT redacted. */
export function findCleartextSectionByField(
    agreement: Agreement | RedactableAgreement,
    fieldName: string,
): AgreementSection | undefined {
    const s = findAnySectionsByField(agreement, fieldName).find((x) => !isRedactedSection(x));
    return s as AgreementSection | undefined;
}

export function getTopologyParentOrderHashes(agreement: Agreement | null | undefined): string[] | null {
    if (!agreement) return null;

    const section = sectionByField(agreement, "parentOrderHashes");
    if (!section) return null;

    const rawParentOrderHashes = (section.data as Record<string, unknown>).parentOrderHashes;
    if (!Array.isArray(rawParentOrderHashes)) return [];

    return rawParentOrderHashes.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
}

export function getTopologyMode(agreement: Agreement | null | undefined): TopologyMode | null {
    if (!agreement) return null;

    const section = sectionByField(agreement, "topologyMode");
    if (!section) return null;

    const topologyMode = (section.data as Record<string, unknown>).topologyMode;
    if (topologyMode === "root" || topologyMode === "explicit" || topologyMode === "linear-fallback") {
        return topologyMode;
    }

    return null;
}

export function summarizeAgreement(agreement: Agreement | null | undefined): AgreementSummary | null {
    if (!agreement) return null;

    // Field names are the lookup vocabulary — see `sectionsByField`.
    const geoSection = sectionByField(agreement, "originGeohash");
    const topologySection = sectionByField(agreement, "parentOrderHashes");
    const modalitySection = sectionByField(agreement, "modality");
    const coordinationSection = sectionByField(agreement, "coordination");
    const handoffSection = sectionByField(agreement, "handoff");
    // GHG disclosure is multi-valued: one section per accounting standard the
    // seller reports under; each disclosure clause declares a `scope` field.
    const ghgDisclosures = sectionsByField(agreement, "scope");

    return {
        geo: geoSection
            ? {
                origin: typeof geoSection.data.originGeohash === "string" ? geoSection.data.originGeohash : undefined,
                destination: typeof geoSection.data.destinationGeohash === "string" ? geoSection.data.destinationGeohash : undefined,
                mass: typeof geoSection.data.massGrams === "number" || typeof geoSection.data.massGrams === "string"
                    ? geoSection.data.massGrams
                    : undefined,
                volume: typeof geoSection.data.volumeMl === "number" || typeof geoSection.data.volumeMl === "string"
                    ? geoSection.data.volumeMl
                    : undefined,
                classOfService: typeof geoSection.data.classOfService === "string"
                    ? geoSection.data.classOfService
                    : undefined,
            }
            : undefined,
        topology: topologySection
            ? {
                topologyMode: getTopologyMode(agreement) ?? "root",
                parentOrderHashes: getTopologyParentOrderHashes(agreement) ?? [],
            }
            : undefined,
        fulfilment: modalitySection
            ? (() => {
                const modality = typeof modalitySection.data.modality === "string"
                    ? modalitySection.data.modality
                    : undefined;
                const coordination = typeof coordinationSection?.data.coordination === "string"
                    ? coordinationSection.data.coordination
                    : undefined;
                return {
                    modality,
                    coordination,
                    method: deriveCanonicalFulfilmentMethod(modality, coordination),
                };
            })()
            : undefined,
        ghg: ghgDisclosures.length > 0
            ? {
                clauseKeys: ghgDisclosures.map((d) => d.clause),
                // Single-standard back-compat for callers that take one label.
                // The registered spec's title IS the standard's label (the
                // network-defined SSoT, e.g. "ISO 14064").
                standard: getClauseSpec(ghgDisclosures[0].clause)?.title,
                scope: typeof ghgDisclosures[0].data.scope === "number"
                    ? ghgDisclosures[0].data.scope
                    : undefined,
            }
            : undefined,
        handoff: handoffSection
            ? {
                points: Array.isArray(handoffSection.data.handoff)
                    ? handoffSection.data.handoff as readonly string[]
                    : [],
            }
            : undefined,
    };
}

/** A single Layer-A issue found before signing: which clause, which field path
 *  (or "(merkle)"), and what's wrong. */
export interface CommitmentAgreementIssue {
    clause: string;
    path: string;
    message: string;
}

/**
 * Layer A of the verification stack, run on BOTH sides of the bilateral commit
 * (buyer before initiating, seller before counter-signing) so neither party
 * signs an invalid agreement. Two checks:
 *
 *   1. MERKLE INTEGRITY — the `agreementHash` about to be signed equals the
 *      merkle root computed from the agreement's sections. (Load-bearing
 *      seller-side: the seller receives the agreement over the relay and must
 *      confirm it matches the hash in the commitment before counter-signing.)
 *   2. CONTENT VALIDITY — every PRESENT section conforms to its clause spec,
 *      via the same `validateContent` the sequencer mempool (Layer B) and the
 *      on-chain `IClauseValidator` (Layer C) enforce. `category-1` runtime
 *      clauses are skipped: they are presence-markers here whose content is
 *      attested (and validated on-chain) later, not at commit. Sections are NOT
 *      skipped for being empty — if a clause is in the agreement, its content
 *      must be valid (geo included; opting out of geo means not composing it).
 *
 * Catches a malformed agreement client-side, before it costs a mempool/chain
 * round-trip.
 */
export function validateCommitmentAgreement(
    agreement: Agreement,
    expectedHash: `0x${string}`,
): { ok: boolean; issues: CommitmentAgreementIssue[] } {
    const issues: CommitmentAgreementIssue[] = [];

    // Content validity FIRST — `validateContent` reports errors gracefully. The
    // merkle hash below *encodes* every section's content and would THROW on
    // malformed input (e.g. an out-of-range enum can't be ABI-encoded), so a
    // bad section must be caught here before we attempt the hash.
    for (const section of agreement.sections) {
        const spec = getClauseSpec(section.clause);
        if (!spec) continue;
        if (spec.block?.tier === "category-1") continue;
        const result = validateContent(section.data, spec);
        if (!result.ok) {
            for (const e of result.errors) {
                issues.push({ clause: section.clause, path: e.path, message: e.message });
            }
        }
    }

    // Merkle integrity — only meaningful (and only computable without throwing)
    // when the content is well-formed. The signed hash must equal the agreement's
    // computed root, so a party signs exactly what it sees.
    if (issues.length === 0) {
        let computed: `0x${string}` | null = null;
        try {
            computed = computeAgreementHash(agreement);
        } catch (cause) {
            issues.push({
                clause: "(merkle)",
                path: "agreementHash",
                message: `agreement content failed to encode: ${cause instanceof Error ? cause.message : String(cause)}`,
            });
        }
        if (computed && computed.toLowerCase() !== expectedHash.toLowerCase()) {
            issues.push({
                clause: "(merkle)",
                path: "agreementHash",
                message: `signed hash ${expectedHash} does not match the agreement's computed root ${computed}`,
            });
        }
    }

    return { ok: issues.length === 0, issues };
}
