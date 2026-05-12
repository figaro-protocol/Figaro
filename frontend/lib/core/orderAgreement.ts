import type { ManifestFields } from "@/lib/core/encoding";
import {
    type AgreementLineItem,
    buildAgreement,
    buildCommerceSection,
    buildTopologySection,
    FULFILMENT_V2_SCHEMA_KEY,
    GHG_SCHEMA_KEY,
    GHG_DISCLOSURE_SCHEMA_KEYS,
    GHG_STANDARD_TO_SCHEMA,
    GHG_SCHEMA_TO_STANDARD,
    JURISDICTION_SCHEMA_KEY,
    CONSENT_SCHEMA_KEY,
    MERCHANT_PROCESS_SCHEMA_KEY,
    OFFSET_POLICY_SCHEMA_KEY,
    PROXIMITY_POLICY_SCHEMA_KEY,
    getSection,
    manifestFieldsToGeoSection,
    TOPOLOGY_SCHEMA_KEY,
    type Agreement,
    type AgreementSection,
    type TopologyMode,
} from "@/lib/core/agreementManifest";

// ── Multi-valued fulfilment + proximity composition ────────────────────────
//
// The drawer composes a per-node agreement by toggling sets of options into
// the manifestFields object. Two array fields drive fulfilment (modalities,
// coordinations, handoffPoints) and one drives proximity (bands). Empty
// (or absent) array = clause not in the agreement.

/** Canonical method strings used by single-selection consumers (canvas edge
 *  pill, cart, swap-mechanism flow). Each value collapses a v2 (modality,
 *  coordination) pair to a single string. */
export const CANONICAL_FULFILMENT_METHODS_LIST = [
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
const ALLOWED_OFFSET_PROVIDERS: ReadonlyArray<string> = ["klima", "toucan", "moss", "custom"];

/** Filter a manifest-field array down to known enum values. */
function readManifestArray(
    fields: ManifestFields | undefined,
    key: string,
    allowed: ReadonlyArray<string>,
): string[] {
    if (!fields) return [];
    const value = fields[key];
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && allowed.includes(v));
}

function readManifestExtra(fields: ManifestFields | undefined, keys: string[]): string | undefined {
    if (!fields) return undefined;

    for (const key of keys) {
        const value = fields[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return undefined;
}

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
        // Delivery without coordination is invalid at the schema level; the
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

function hasGeoFields(fields: ManifestFields | undefined): boolean {
    return !!(
        fields?.origin?.trim()
        || fields?.destination?.trim()
        || fields?.mass?.trim()
        || fields?.volume?.trim()
        || fields?.class_?.trim()
    );
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
    manifestFields?: ManifestFields;
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
        /** Schema keys of each GHG disclosure clause in the agreement
         *  (e.g., "figaro-ghg-iso-14064-v1"). Multi-valued. */
        schemaKeys: readonly string[];
        /** Human-readable label of the first declared standard (back-compat). */
        standard?: string;
        /** Scope from the first declared standard (back-compat). */
        scope?: number;
    };
    proximity?: {
        /** Proximity-policy bands offered. */
        bands: readonly string[];
    };
    offset?: {
        /** Carbon-offset providers offered. */
        providers: readonly string[];
    };
    jurisdiction?: Record<string, unknown>;
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

    if (hasGeoFields(params.manifestFields)) {
        sections.push(manifestFieldsToGeoSection(params.manifestFields!));
    }

    const modalities = readManifestArray(params.manifestFields, "fulfilmentModalities", ALLOWED_MODALITIES);
    const coordinations = readManifestArray(params.manifestFields, "fulfilmentCoordinations", ALLOWED_COORDINATIONS);
    const handoffPoints = readManifestArray(params.manifestFields, "fulfilmentHandoffPoints", ALLOWED_HANDOFF_POINTS);
    if (modalities.length > 0) {
        const data: Record<string, unknown> = { modalities };
        // The validator requires coordinations non-empty IFF delivery is
        // offered. Default to "seller-assigned" when delivery has no
        // coordination specified, and drop coordinations when delivery isn't
        // offered (template/runtime mistakes shouldn't break encoding here —
        // the schema validator catches genuine drift downstream).
        if (modalities.includes("delivery")) {
            data.coordinations = coordinations.length > 0 ? coordinations : ["seller-assigned"];
        }
        if (handoffPoints.length > 0) data.handoffPoints = handoffPoints;
        sections.push({
            schema: FULFILMENT_V2_SCHEMA_KEY,
            data,
        });
        // Authorize the seller's sovereign merchant event log against this
        // order's agreementHash. Category-1: empty sectionData; the runtime
        // attestation supplies the eventType + evidenceUri content. Without
        // this section the on-chain inclusion proof for figaro-merchant-
        // process-v1 attestations cannot open.
        sections.push({
            schema: MERCHANT_PROCESS_SCHEMA_KEY,
            data: {},
        });
    }

    // Multi-valued: each declared GHG standard produces its own disclosure
    // clause. `ghgStandards` (array of schemaIds OR legacy standard labels)
    // is the new path; the legacy single `ghgStandard` + `ghgScope` is read
    // as a fallback for any caller that hasn't migrated.
    const ghgStandards = readManifestArray(
        params.manifestFields,
        "ghgStandards",
        GHG_DISCLOSURE_SCHEMA_KEYS as ReadonlyArray<string>,
    );
    const legacyStandard = readManifestExtra(params.manifestFields, ["ghgStandard", "ghgMethodology"]);
    const ghgScope = readManifestExtra(params.manifestFields, ["ghgScope"]);
    const resolvedSchemaKeys: string[] = ghgStandards.length > 0
        ? ghgStandards
        : legacyStandard
            ? [GHG_STANDARD_TO_SCHEMA[legacyStandard] ?? GHG_SCHEMA_KEY]
            : [];
    for (const schemaKey of resolvedSchemaKeys) {
        const data: Record<string, unknown> = {};
        const parsedScope = ghgScope ? Number(ghgScope) : 1;
        data.scope = Number.isFinite(parsedScope) ? parsedScope : 1;
        sections.push({ schema: schemaKey, data });
    }

    const proximityBands = readManifestArray(params.manifestFields, "proximityBands", ALLOWED_PROXIMITY_BANDS);
    if (proximityBands.length > 0) {
        sections.push({
            schema: PROXIMITY_POLICY_SCHEMA_KEY,
            data: { bands: proximityBands },
        });
    }

    const offsetProviders = readManifestArray(params.manifestFields, "offsetProviders", ALLOWED_OFFSET_PROVIDERS);
    if (offsetProviders.length > 0) {
        sections.push({
            schema: OFFSET_POLICY_SCHEMA_KEY,
            data: { providers: offsetProviders },
        });
    }

    const klerosCourt = readManifestExtra(params.manifestFields, ["klerosCourt"]);
    const klerosMinJurorsRaw = readManifestExtra(params.manifestFields, ["klerosMinJurors"]);
    const applicableLaw = readManifestExtra(params.manifestFields, ["applicableLaw"]);
    const forum = readManifestExtra(params.manifestFields, ["forum"]);
    const language = readManifestExtra(params.manifestFields, ["language"]);
    const ALLOWED_KLEROS_COURTS = ["general", "blockchain-nontechnical", "blockchain-technical", "english-language"];
    const klerosCourtValue = klerosCourt && ALLOWED_KLEROS_COURTS.includes(klerosCourt) ? klerosCourt : undefined;
    if (klerosCourtValue || applicableLaw) {
        const data: Record<string, unknown> = {};
        if (klerosCourtValue) {
            data.klerosCourt = klerosCourtValue;
            const parsed = klerosMinJurorsRaw ? Number(klerosMinJurorsRaw) : 3;
            data.klerosMinJurors = Number.isFinite(parsed) && parsed >= 1 ? parsed : 3;
        }
        if (applicableLaw) data.applicableLaw = applicableLaw;
        if (forum) data.forum = forum;
        if (language) data.language = language;
        sections.push({
            schema: JURISDICTION_SCHEMA_KEY,
            data,
        });
    }

    // Consent: multi-document array. Each row must have non-empty hash +
    // version + title; partial rows are silently dropped. The Layer-C
    // validator catches structural violations downstream.
    const rawConsentDocuments = params.manifestFields?.consentDocuments;
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
        sections.push({
            schema: CONSENT_SCHEMA_KEY,
            data: { documents: consentDocuments },
        });
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

    const section = getSection(agreement, TOPOLOGY_SCHEMA_KEY);
    if (!section) return null;

    const rawParentOrderHashes = (section.data as Record<string, unknown>).parentOrderHashes;
    if (!Array.isArray(rawParentOrderHashes)) return [];

    return rawParentOrderHashes.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
}

export function getTopologyMode(agreement: Agreement | null | undefined): TopologyMode | null {
    if (!agreement) return null;

    const section = getSection(agreement, TOPOLOGY_SCHEMA_KEY);
    if (!section) return null;

    const topologyMode = (section.data as Record<string, unknown>).topologyMode;
    if (topologyMode === "root" || topologyMode === "explicit" || topologyMode === "linear-fallback") {
        return topologyMode;
    }

    return null;
}

export function summarizeAgreement(agreement: Agreement | null | undefined): AgreementSummary | null {
    if (!agreement) return null;

    const geoSection = getSection(agreement, "figaro-geo-v2");
    const topologySection = getSection(agreement, TOPOLOGY_SCHEMA_KEY);
    const fulfilmentSection = getSection(agreement, FULFILMENT_V2_SCHEMA_KEY);
    const proximitySection = getSection(agreement, PROXIMITY_POLICY_SCHEMA_KEY);
    const offsetSection = getSection(agreement, OFFSET_POLICY_SCHEMA_KEY);
    const jurisdictionSection = getSection(agreement, JURISDICTION_SCHEMA_KEY);
    const consentSection = getSection(agreement, CONSENT_SCHEMA_KEY);
    // GHG disclosure is multi-valued: agreement may carry one section per
    // standard the merchant reports under.
    const ghgDisclosures = GHG_DISCLOSURE_SCHEMA_KEYS
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
                const modalities = Array.isArray(fulfilmentSection.data.modalities)
                    ? fulfilmentSection.data.modalities as readonly string[]
                    : [];
                const coordinations = Array.isArray(fulfilmentSection.data.coordinations)
                    ? fulfilmentSection.data.coordinations as readonly string[]
                    : [];
                const handoffPoints = Array.isArray(fulfilmentSection.data.handoffPoints)
                    ? fulfilmentSection.data.handoffPoints as readonly string[]
                    : [];
                const method = deriveCanonicalFulfilmentMethod(modalities, coordinations);
                return {
                    modalities,
                    coordinations,
                    handoffPoints,
                    // Single-method back-compat for downstream consumers
                    // (canvas edge pill, cart). null when modalities is empty
                    // or coordinations are missing for a delivery offer.
                    method,
                };
            })()
            : undefined,
        ghg: ghgDisclosures.length > 0
            ? {
                schemaKeys: ghgDisclosures.map((d) => d.key),
                // Single-standard back-compat for callers that take one label.
                standard: GHG_SCHEMA_TO_STANDARD[ghgDisclosures[0].key],
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
        offset: offsetSection
            ? {
                providers: Array.isArray(offsetSection.data.providers)
                    ? offsetSection.data.providers as readonly string[]
                    : [],
            }
            : undefined,
        jurisdiction: jurisdictionSection?.data,
        consent: consentSection?.data,
    };
}
