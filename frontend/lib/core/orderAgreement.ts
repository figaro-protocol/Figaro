import type { ClauseFields } from "@/lib/core/encoding";
import {
    type AgreementLineItem,
    buildAgreement,
    buildCommerceSection,
    buildTopologySection,
    FULFILMENT_V2_CLAUSE_KEY,
    GEO_CLAUSE_KEY,
    GHG_CLAUSE_KEY,
    GHG_DISCLOSURE_CLAUSE_KEYS,
    GHG_MEASUREMENT_CLAUSE_KEY,
    GHG_STANDARD_TO_CLAUSE,
    GHG_CLAUSE_TO_STANDARD,
    ARBITRATION_KLEROS_CLAUSE_KEY,
    APPLICABLE_LAW_CLAUSE_KEY,
    CONSENT_CLAUSE_KEY,
    COURIER_PROCESS_CLAUSE_KEY,
    MERCHANT_PROCESS_CLAUSE_KEY,
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
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

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

const ALLOWED_MODALITIES: ReadonlyArray<string> = ["consume-onsite", "pickup", "delivery", "virtual"];
const ALLOWED_COORDINATIONS: ReadonlyArray<string> = ["buyer-assigned", "seller-assigned", "dutch-auction"];
const ALLOWED_HANDOFF_POINTS: ReadonlyArray<string> = ["face-to-face", "dead-drop", "parking-area", "locker"];
const ALLOWED_PROXIMITY_BANDS: ReadonlyArray<string> = ["zone-wifi", "nearby-ble", "contact-nfc"];

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

export function buildOrderAgreement(params: BuildOrderAgreementParams): Agreement {
    const explicitParentOrderHashes = dedupeOrderHashes(params.parentOrderHashes);
    const fallbackParentOrderHashes = dedupeOrderHashes(params.fallbackParentOrderHashes);
    const topologyParentOrderHashes = explicitParentOrderHashes.length > 0
        ? explicitParentOrderHashes
        : fallbackParentOrderHashes;

    const topologyMode: TopologyMode = topologyParentOrderHashes.length === 0
        ? "root"
        : explicitParentOrderHashes.length > 0
            ? "explicit"
            : "linear-fallback";

    const sections: AgreementSection[] = [
        buildCommerceSection({
            currency: params.currency,
            payment: params.payment,
            lineItems: params.lineItems,
        }),
        buildTopologySection({
            topologyMode,
            parentOrderHashes: topologyParentOrderHashes,
        }),
    ];

    // clauseFields is now the template's nested, spec-named shape:
    // clauseId → its field values. Most clauses project straight to a section
    // (data === the values); geo is the one that needs encoding; a few add
    // their auto-paired Category-1 leaves.
    const cf: ClauseFields = params.clauseFields ?? {};
    const arrOf = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

    // Geo — raw checkout strings (origin / "5 kg") → encoded section.
    const geo = cf[GEO_CLAUSE_KEY];
    if (
        geo &&
        (typeof geo.origin === "string" ||
            typeof geo.destination === "string" ||
            typeof geo.mass === "string" ||
            typeof geo.volume === "string")
    ) {
        sections.push(
            clauseFieldsToGeoSection(
                geo as { origin?: string; destination?: string; mass?: string; volume?: string; class_?: string },
            ),
        );
    }

    // Fulfilment — the buyer's request. Coordination + handoff are sub-clauses
    // under delivery, matching the clause JSON. Handoff's next sub-clause,
    // proximity, is the separate figaro-proximity-policy-v1 section below.
    const fulfilment = cf[FULFILMENT_V2_CLAUSE_KEY];
    const modalities = arrOf(fulfilment?.modalities).filter((m) => ALLOWED_MODALITIES.includes(m));
    if (modalities.length > 0) {
        const data: Record<string, unknown> = { modalities };
        // The validator requires coordination non-empty IFF delivery is the
        // request; default to "seller-assigned" when unset.
        if (modalities.includes("delivery")) {
            const deliveryIn = (fulfilment?.delivery ?? {}) as Record<string, unknown>;
            const coords = arrOf(deliveryIn.coordination).filter((c) => ALLOWED_COORDINATIONS.includes(c));
            data.delivery = {
                coordination: coords.length > 0 ? coords : ["seller-assigned"],
            };
        }
        // Handoff applies to any physical exchange (on-site / pickup / delivery).
        // Flat array-of-enum (the clause JSON), single-select in the drawer.
        const handoff = arrOf(fulfilment?.handoff).filter((h) => ALLOWED_HANDOFF_POINTS.includes(h));
        if (handoff.length > 0) data.handoff = handoff;
        sections.push({ clause: FULFILMENT_V2_CLAUSE_KEY, data });
    }

    // Per-role sovereign event-log anchors (Category-1, empty data). Pure
    // projection: a clause is included iff the template carries it. The designer
    // materializes merchant-process / courier-process into the template at design
    // time (selecting delivery activates them on the canvas) — they are NOT
    // re-derived here.
    if (cf[MERCHANT_PROCESS_CLAUSE_KEY]) {
        sections.push({ clause: MERCHANT_PROCESS_CLAUSE_KEY, data: {} });
    }
    if (cf[COURIER_PROCESS_CLAUSE_KEY]) {
        sections.push({ clause: COURIER_PROCESS_CLAUSE_KEY, data: {} });
    }

    // GHG disclosures — each selected disclosure clause is its own key.
    const ghgKeys = (GHG_DISCLOSURE_CLAUSE_KEYS as ReadonlyArray<string>).filter((k) => !!cf[k]);
    for (const clauseKey of ghgKeys) {
        const rawScope = (cf[clauseKey] as { scope?: unknown }).scope;
        const parsedScope = typeof rawScope === "number" ? rawScope : Number(rawScope);
        sections.push({
            clause: clauseKey,
            data: { scope: Number.isFinite(parsedScope) && parsedScope ? parsedScope : 1 },
        });
    }
    // Pair the runtime measurement clause with any disclosure so grams can be
    // filed and offsets sized at runtime.
    if (ghgKeys.length > 0) {
        sections.push({ clause: GHG_MEASUREMENT_CLAUSE_KEY, data: {} });
    }

    // Proximity policy + the Category-1 proof leaf its handoff attestation
    // opens against.
    const bands = arrOf(cf[PROXIMITY_POLICY_CLAUSE_KEY]?.bands).filter((b) =>
        ALLOWED_PROXIMITY_BANDS.includes(b),
    );
    if (bands.length > 0) {
        sections.push({ clause: PROXIMITY_POLICY_CLAUSE_KEY, data: { bands } });
        sections.push({
            clause: PROXIMITY_PROOF_CLAUSE_KEY,
            data: { band: bands[0], nonce: `0x${"00".repeat(32)}`, deviceSig: `0x${"00".repeat(65)}` },
        });
    }

    // Jurisdiction — Kleros + applicable law.
    const kleros = cf[ARBITRATION_KLEROS_CLAUSE_KEY];
    const klerosCourt = typeof kleros?.klerosCourt === "string" ? kleros.klerosCourt : undefined;
    const ALLOWED_KLEROS_COURTS = ["general", "blockchain-nontechnical", "blockchain-technical", "english-language"];
    if (klerosCourt && ALLOWED_KLEROS_COURTS.includes(klerosCourt)) {
        const rawJurors = (kleros as { klerosMinJurors?: unknown }).klerosMinJurors;
        const parsed = rawJurors != null && rawJurors !== "" ? Number(rawJurors) : 3;
        sections.push({
            clause: ARBITRATION_KLEROS_CLAUSE_KEY,
            data: { klerosCourt, klerosMinJurors: Number.isFinite(parsed) && parsed >= 1 ? parsed : 3 },
        });
    }
    const law = cf[APPLICABLE_LAW_CLAUSE_KEY];
    const applicableLaw = typeof law?.applicableLaw === "string" && law.applicableLaw ? law.applicableLaw : undefined;
    if (applicableLaw) {
        const data: Record<string, unknown> = { applicableLaw };
        if (typeof law?.forum === "string" && law.forum) data.forum = law.forum;
        if (typeof law?.language === "string" && law.language) data.language = law.language;
        sections.push({ clause: APPLICABLE_LAW_CLAUSE_KEY, data });
    }

    // Consent: multi-document array. Each row must have non-empty hash +
    // version + title; partial rows are silently dropped.
    const rawConsentDocuments = cf[CONSENT_CLAUSE_KEY]?.documents;
    const consentDocuments = Array.isArray(rawConsentDocuments)
        ? rawConsentDocuments.filter((doc): doc is {
            documentHash: string;
            documentVersion: string;
            documentTitle: string;
        } =>
            typeof doc === "object" && doc !== null
            && typeof (doc as Record<string, unknown>).documentHash === "string"
            && typeof (doc as Record<string, unknown>).documentVersion === "string"
            && typeof (doc as Record<string, unknown>).documentTitle === "string"
            && (doc as Record<string, string>).documentHash.trim() !== ""
            && (doc as Record<string, string>).documentVersion.trim() !== ""
            && (doc as Record<string, string>).documentTitle.trim() !== "",
        )
        : [];
    if (consentDocuments.length > 0) {
        sections.push({ clause: CONSENT_CLAUSE_KEY, data: { documents: consentDocuments } });
    }

    if (params.extraSections?.length) {
        sections.push(...params.extraSections);
    }

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
