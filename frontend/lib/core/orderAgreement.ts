import type { ClauseFields } from "@/lib/core/encoding";
import {
    type AgreementLineItem,
    buildAgreement,
    FULFILMENT_V2_CLAUSE_KEY,
    GEO_CLAUSE_KEY,
    GHG_CLAUSE_KEY,
    GHG_DISCLOSURE_CLAUSE_KEYS,
    GHG_MEASUREMENT_CLAUSE_KEY,
    GHG_STANDARD_TO_CLAUSE,
    GHG_CLAUSE_TO_STANDARD,
    ARBITRATION_KLEROS_CLAUSE_KEY,
    APPLICABLE_LAW_CLAUSE_KEY,
    COMMERCE_CLAUSE_KEY,
    CONSENT_CLAUSE_KEY,
    PROXIMITY_POLICY_CLAUSE_KEY,
    PROXIMITY_PROOF_CLAUSE_KEY,
    getSection,
    clauseFieldsToGeoSection,
    computeAgreementHash,
    TOPOLOGY_CLAUSE_KEY,
    type Agreement,
    type AgreementSection,
    type TopologyMode,
} from "@/lib/core/agreement";
import { validateContent } from "@figaro/core/clauses";
import { getClauseSpec, clauseEnumValues } from "@/lib/shared/clauseSpecSource";

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

/** Pull a canonical fulfilment method out of the v2 section's first
 *  (modality, coordination) pair. Returns null when the section's modalities
 *  array is empty or contains only unrecognized values. Used by downstream
 *  single-selection consumers (canvas pill, cart). */
export function deriveCanonicalFulfilmentMethod(
    modalities: readonly string[],
    coordinations: readonly string[],
): CanonicalFulfilmentMethod | null {
    const m = modalities[0];
    if (!m) return null;
    if (m === "consume-onsite") return "consume-onsite";
    if (m === "pickup") return "pickup";
    if (m === "virtual") return "virtual";
    if (m === "delivery") {
        const c = coordinations[0];
        if (c === "buyer-assigned") return "deliver:buyer-assigned";
        if (c === "seller-assigned") return "deliver:seller-assigned";
        if (c === "dutch-auction") return "deliver:dutch-auction";
        // Delivery without coordination is invalid at the clause level; the
        // encoder will throw. Surface as null here so the caller knows.
        return null;
    }
    return null;
}

/** Inverse of `deriveCanonicalFulfilmentMethod` — split a single canonical
 *  method into the (modalities, coordinations) pair the v2 section expects. */
export function canonicalFulfilmentMethodToArrays(
    method: CanonicalFulfilmentMethod,
): { modalities: string[]; coordinations: string[] } {
    switch (method) {
        case "consume-onsite": return { modalities: ["consume-onsite"], coordinations: [] };
        case "pickup": return { modalities: ["pickup"], coordinations: [] };
        case "virtual": return { modalities: ["virtual"], coordinations: [] };
        case "deliver:buyer-assigned": return { modalities: ["delivery"], coordinations: ["buyer-assigned"] };
        case "deliver:seller-assigned": return { modalities: ["delivery"], coordinations: ["seller-assigned"] };
        case "deliver:dutch-auction": return { modalities: ["delivery"], coordinations: ["dutch-auction"] };
    }
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
        /** Modalities offered for this order. */
        modalities: readonly string[];
        /** Courier coordinations offered. Non-empty IFF delivery is in modalities. */
        coordinations: readonly string[];
        /** Handoff points offered. */
        handoffPoints: readonly string[];
        /** Single canonical method derived from `modalities[0]` + `coordinations[0]`.
         *  null when modalities is empty, or delivery is offered without coordination. */
        method: CanonicalFulfilmentMethod | null;
    };
    ghg?: {
        /** Clause keys of each GHG disclosure clause in the agreement
         *  (e.g., "figaro-ghg-iso-14064-v1"). Multi-valued. */
        clauseKeys: readonly string[];
        /** Human-readable label of the first declared standard (back-compat). */
        standard?: string;
        /** Scope from the first declared standard (back-compat). */
        scope?: number;
    };
    proximity?: {
        /** Proximity-policy bands offered. */
        bands: readonly string[];
    };
    /** Applicable-law / state / ADR recourse layer. */
    jurisdiction?: Record<string, unknown>;
    /** Decentralized arbitration provider clause (e.g., Kleros). */
    arbitration?: Record<string, unknown>;
    consent?: Record<string, unknown>;
}

/** Fold an order's two STRUCTURAL clauses — commerce + topology — into its
 *  clause set. These are the always-referenced defaults: their data is the
 *  order's structural properties (payment/currency; DAG position), not drawer
 *  composition. Topology mode is derived from the parent set. Every OTHER clause
 *  is already composed in `clauseFields`. This is the single place the two
 *  structural clauses' data is assembled; from there they are projected by the
 *  same generic loop as every other clause — no special-casing in the build. */
function composeOrderClauseFields(params: BuildOrderAgreementParams): ClauseFields {
    const explicit = dedupeOrderHashes(params.parentOrderHashes);
    const fallback = dedupeOrderHashes(params.fallbackParentOrderHashes);
    const parents = explicit.length > 0 ? explicit : fallback;
    const topologyMode: TopologyMode =
        parents.length === 0 ? "root" : explicit.length > 0 ? "explicit" : "linear-fallback";
    return {
        ...(params.clauseFields ?? {}),
        [COMMERCE_CLAUSE_KEY]: {
            currency: params.currency,
            payment: params.payment.toString(),
            lineItems: params.lineItems ?? [],
        },
        [TOPOLOGY_CLAUSE_KEY]: { topologyMode, parentOrderHashes: parents },
    };
}

export function buildOrderAgreement(params: BuildOrderAgreementParams): Agreement {
    // The agreement is a GENERIC projection over the order's clause set. The two
    // structural clauses (commerce + topology) are folded in by
    // composeOrderClauseFields; every other clause is whatever the assembly
    // composed, INCLUDING permissionlessly-registered clauses this code has
    // never heard of — those pass through verbatim. The encoder map below holds
    // the per-clause field transforms / defaults / companion leaves still living
    // in code (transitional — they move into each clause's spec). Sections are
    // sorted by clause key so the pinned JSON is deterministic; the merkle root
    // sorts its own leaves, so order never affects agreementHash.
    const cf: ClauseFields = composeOrderClauseFields(params);
    const arrOf = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

    // clauseId → its field transform. A clause with no entry is permissionless
    // to this code and projects its fields verbatim. Some entries emit a paired
    // companion leaf (proximity → proof). Empty/invalid input → null (dropped).
    type ClauseEncoder = (fields: Record<string, unknown>) => AgreementSection | AgreementSection[] | null;
    const ENCODERS: Record<string, ClauseEncoder> = {
        [GEO_CLAUSE_KEY]: (geo) => {
            if (
                typeof geo.origin === "string" ||
                typeof geo.destination === "string" ||
                typeof geo.mass === "string" ||
                typeof geo.volume === "string"
            ) {
                return clauseFieldsToGeoSection(
                    geo as { origin?: string; destination?: string; mass?: string; volume?: string; class_?: string },
                );
            }
            return null;
        },
        [FULFILMENT_V2_CLAUSE_KEY]: (fulfilment) => {
            const allowedModalities = clauseEnumValues(FULFILMENT_V2_CLAUSE_KEY, "modalities");
            const modalities = arrOf(fulfilment.modalities).filter((m) => allowedModalities.includes(m));
            if (modalities.length === 0) return null;
            const data: Record<string, unknown> = { modalities };
            // The validator requires coordination non-empty IFF delivery is the
            // request; default to "seller-assigned" when unset.
            if (modalities.includes("delivery")) {
                const deliveryIn = (fulfilment.delivery ?? {}) as Record<string, unknown>;
                const allowedCoordinations = clauseEnumValues(FULFILMENT_V2_CLAUSE_KEY, "delivery.coordination");
                const coords = arrOf(deliveryIn.coordination).filter((c) => allowedCoordinations.includes(c));
                data.delivery = { coordination: coords.length > 0 ? coords : ["seller-assigned"] };
            }
            const allowedHandoff = clauseEnumValues(FULFILMENT_V2_CLAUSE_KEY, "handoff");
            const handoff = arrOf(fulfilment.handoff).filter((h) => allowedHandoff.includes(h));
            if (handoff.length > 0) data.handoff = handoff;
            return { clause: FULFILMENT_V2_CLAUSE_KEY, data };
        },
        [PROXIMITY_POLICY_CLAUSE_KEY]: (fields) => {
            const allowedBands = clauseEnumValues(PROXIMITY_POLICY_CLAUSE_KEY, "bands");
            const bands = arrOf(fields.bands).filter((b) => allowedBands.includes(b));
            if (bands.length === 0) return null;
            return [
                { clause: PROXIMITY_POLICY_CLAUSE_KEY, data: { bands } },
                {
                    clause: PROXIMITY_PROOF_CLAUSE_KEY,
                    data: { band: bands[0], nonce: `0x${"00".repeat(32)}`, deviceSig: `0x${"00".repeat(65)}` },
                },
            ];
        },
        [ARBITRATION_KLEROS_CLAUSE_KEY]: (kleros) => {
            const klerosCourt = typeof kleros.klerosCourt === "string" ? kleros.klerosCourt : undefined;
            const ALLOWED_KLEROS_COURTS = ["general", "blockchain-nontechnical", "blockchain-technical", "english-language"];
            if (!klerosCourt || !ALLOWED_KLEROS_COURTS.includes(klerosCourt)) return null;
            const rawJurors = (kleros as { klerosMinJurors?: unknown }).klerosMinJurors;
            const parsed = rawJurors != null && rawJurors !== "" ? Number(rawJurors) : 3;
            return {
                clause: ARBITRATION_KLEROS_CLAUSE_KEY,
                data: { klerosCourt, klerosMinJurors: Number.isFinite(parsed) && parsed >= 1 ? parsed : 3 },
            };
        },
        [APPLICABLE_LAW_CLAUSE_KEY]: (law) => {
            const applicableLaw = typeof law.applicableLaw === "string" && law.applicableLaw ? law.applicableLaw : undefined;
            if (!applicableLaw) return null;
            const data: Record<string, unknown> = { applicableLaw };
            if (typeof law.forum === "string" && law.forum) data.forum = law.forum;
            if (typeof law.language === "string" && law.language) data.language = law.language;
            return { clause: APPLICABLE_LAW_CLAUSE_KEY, data };
        },
        [CONSENT_CLAUSE_KEY]: (fields) => {
            const rawConsentDocuments = fields.documents;
            const consentDocuments = Array.isArray(rawConsentDocuments)
                ? rawConsentDocuments.filter((doc): doc is { documentHash: string; documentVersion: string; documentTitle: string } =>
                    typeof doc === "object" && doc !== null
                    && typeof (doc as Record<string, unknown>).documentHash === "string"
                    && typeof (doc as Record<string, unknown>).documentVersion === "string"
                    && typeof (doc as Record<string, unknown>).documentTitle === "string"
                    && (doc as Record<string, string>).documentHash.trim() !== ""
                    && (doc as Record<string, string>).documentVersion.trim() !== ""
                    && (doc as Record<string, string>).documentTitle.trim() !== "",
                )
                : [];
            return consentDocuments.length > 0
                ? { clause: CONSENT_CLAUSE_KEY, data: { documents: consentDocuments } }
                : null;
        },
        // Each GHG disclosure clause → its scope section. The paired runtime
        // measurement leaf is added once below (companion of *any* disclosure).
        ...Object.fromEntries(
            (GHG_DISCLOSURE_CLAUSE_KEYS as ReadonlyArray<string>).map((k): [string, ClauseEncoder] => [
                k,
                (fields) => {
                    const rawScope = (fields as { scope?: unknown }).scope;
                    const parsedScope = typeof rawScope === "number" ? rawScope : Number(rawScope);
                    return { clause: k, data: { scope: Number.isFinite(parsedScope) && parsedScope ? parsedScope : 1 } };
                },
            ]),
        ),
    };

    // Project every clause in the set — structural (commerce, topology) and
    // composed alike — through ONE loop. Known clauses use their encoder;
    // unknown (permissionless) clauses pass through verbatim. commerce + topology
    // have no encoder, so they pass through from the data composeOrderClauseFields
    // folded in.
    const sections: AgreementSection[] = [];
    for (const clauseId of Object.keys(cf)) {
        const encode = ENCODERS[clauseId];
        const fields = (cf[clauseId] ?? {}) as Record<string, unknown>;
        const projected = encode
            ? encode(fields)
            : {
                  clause: clauseId,
                  // Spec-driven default. A Category-1 clause is an event-log ANCHOR:
                  // its agreement section is empty — its fields (eventType, etc.) are
                  // filled at runtime via attestation, not composed at build. Read
                  // from the spec's block.tier. Every other clause (incl. unknown /
                  // permissionless) projects its fields verbatim.
                  data: getClauseSpec(clauseId)?.block?.tier === "category-1" ? {} : fields,
              };
        if (projected == null) continue;
        if (Array.isArray(projected)) sections.push(...projected);
        else sections.push(projected);
    }

    // Companion leaf: the runtime measurement clause pairs with any GHG
    // disclosure (added once). Companion declarations move into the spec later.
    if ((GHG_DISCLOSURE_CLAUSE_KEYS as ReadonlyArray<string>).some((k) => !!cf[k])) {
        sections.push({ clause: GHG_MEASUREMENT_CLAUSE_KEY, data: {} });
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

export function getTopologyParentOrderHashes(agreement: Agreement | null | undefined): string[] | null {
    if (!agreement) return null;

    const section = getSection(agreement, TOPOLOGY_CLAUSE_KEY);
    if (!section) return null;

    const rawParentOrderHashes = (section.data as Record<string, unknown>).parentOrderHashes;
    if (!Array.isArray(rawParentOrderHashes)) return [];

    return rawParentOrderHashes.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
}

export function getTopologyMode(agreement: Agreement | null | undefined): TopologyMode | null {
    if (!agreement) return null;

    const section = getSection(agreement, TOPOLOGY_CLAUSE_KEY);
    if (!section) return null;

    const topologyMode = (section.data as Record<string, unknown>).topologyMode;
    if (topologyMode === "root" || topologyMode === "explicit" || topologyMode === "linear-fallback") {
        return topologyMode;
    }

    return null;
}

export function summarizeAgreement(agreement: Agreement | null | undefined): AgreementSummary | null {
    if (!agreement) return null;

    const geoSection = getSection(agreement, GEO_CLAUSE_KEY);
    const topologySection = getSection(agreement, TOPOLOGY_CLAUSE_KEY);
    const fulfilmentSection = getSection(agreement, FULFILMENT_V2_CLAUSE_KEY);
    const proximitySection = getSection(agreement, PROXIMITY_POLICY_CLAUSE_KEY);
    const arbitrationSection = getSection(agreement, ARBITRATION_KLEROS_CLAUSE_KEY);
    const applicableLawSection = getSection(agreement, APPLICABLE_LAW_CLAUSE_KEY);
    const consentSection = getSection(agreement, CONSENT_CLAUSE_KEY);
    // GHG disclosure is multi-valued: agreement may carry one section per
    // standard the merchant reports under.
    const ghgDisclosures = GHG_DISCLOSURE_CLAUSE_KEYS
        .map((key) => ({ key, section: getSection(agreement, key) }))
        .filter(({ section }) => section);

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
        fulfilment: fulfilmentSection
            ? (() => {
                const data = fulfilmentSection.data as Record<string, unknown>;
                const modalities = Array.isArray(data.modalities)
                    ? data.modalities as readonly string[]
                    : [];
                // coordination is a sub-clause under delivery; handoff is a
                // top-level sub-clause (any physical exchange).
                const delivery = (data.delivery ?? {}) as Record<string, unknown>;
                const coordinations = Array.isArray(delivery.coordination)
                    ? delivery.coordination as readonly string[]
                    : [];
                const handoffPoints = Array.isArray(data.handoff)
                    ? data.handoff as readonly string[]
                    : [];
                const method = deriveCanonicalFulfilmentMethod(modalities, coordinations);
                return {
                    // Summary output stays flat so downstream lenses (canvas
                    // pill, cart, audit) don't change; only the section + builder
                    // moved to the nested shape under delivery.
                    modalities,
                    coordinations,
                    handoffPoints,
                    method,
                };
            })()
            : undefined,
        ghg: ghgDisclosures.length > 0
            ? {
                clauseKeys: ghgDisclosures.map((d) => d.key),
                // Single-standard back-compat for callers that take one label.
                standard: GHG_CLAUSE_TO_STANDARD[ghgDisclosures[0].key],
                scope: typeof ghgDisclosures[0].section!.data.scope === "number"
                    ? ghgDisclosures[0].section!.data.scope
                    : undefined,
            }
            : undefined,
        proximity: proximitySection
            ? {
                bands: Array.isArray(proximitySection.data.bands)
                    ? proximitySection.data.bands as readonly string[]
                    : [],
            }
            : undefined,
        jurisdiction: applicableLawSection?.data,
        arbitration: arbitrationSection?.data,
        consent: consentSection?.data,
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
