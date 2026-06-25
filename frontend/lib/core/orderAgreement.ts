/**
 * orderAgreement.ts — order-agreement construction + validation.
 *
 * ONE job: turn a composed order into its canonical Agreement, and validate
 * that Agreement before it is signed.
 *
 *   • BUILD    — buildOrderAgreement(): an order (buyer, seller, currency,
 *                payment, the composed clause fields, topology) → a generic,
 *                spec-driven encode → a canonical Agreement. Names no clause;
 *                permissionlessly-registered clauses pass through untouched.
 *   • VALIDATE — validateCommitmentAgreement(): an Agreement + the hash about
 *                to be signed → content conforms to its clause specs AND the
 *                merkle root matches. Layer A of the verification stack, run on
 *                both sides of the bilateral commit.
 *
 * Reads are by FIELD NAME, never clause id (sectionsByField & friends), so the
 * layer stays open-world.
 *
 * NOT this file's job — these concerns live elsewhere, never here:
 *   • describing/summarizing an agreement for DISPLAY — a read/UI concern.
 *   • the buyer's commerce/checkout "method" — a commerce concern.
 */
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
import { hexEqual } from "@/lib/shared/evm";

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

/** Fold the order's STRUCTURAL clauses into its clause set. A structural clause
 *  (spec `block.structural`) is composed on every order by the build itself —
 *  its data is the order's structural properties (payment/currency; topology
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
        // order's payment + topology position) cannot compose — refuse loudly
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
    //   - runtime → EMPTY anchor (an event-log clause's fields are filled
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
        } else if (spec.block?.tier === "runtime") {
            data = {};
        } else if (clauseIsStructural(clauseId)) {
            data = fields;
        } else {
            data = encodeClauseDataFromSpec(spec.fields, fields);
        }
        if (data === null) continue;
        sections.push({ clause: clauseId, version: spec?.version ?? 1, data });
    }

    // Companion (sister) runtime anchors. A composed clause whose spec declares
    // a runtime `sisterClauseId` pairs with that runtime clause; at build the
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
        if (getClauseSpec(sister)?.block?.tier !== "runtime") continue;
        sections.push({ clause: sister, version: getClauseSpec(sister)?.version ?? 1, data: {} });
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
function findAnySectionsByField(
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
 *      via the SDK's `validateContent` (the off-chain well-formedness check; the
 *      chain does not validate content shape, only merkle-binds it). `runtime`
 *      runtime clauses are skipped: they are presence-markers here whose content
 *      is attested later, not at commit. Sections are NOT skipped for being empty
 *      — if a clause is in the agreement, its content must be valid (geo
 *      included; opting out of geo means not composing it).
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
        if (spec.block?.tier === "runtime") continue;
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
        if (computed && !hexEqual(computed, expectedHash)) {
            issues.push({
                clause: "(merkle)",
                path: "agreementHash",
                message: `signed hash ${expectedHash} does not match the agreement's computed root ${computed}`,
            });
        }
    }

    return { ok: issues.length === 0, issues };
}
