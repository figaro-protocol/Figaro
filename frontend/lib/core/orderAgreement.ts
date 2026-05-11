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
    PROXIMITY_POLICY_SCHEMA_KEY,
    getSection,
    manifestFieldsToGeoSection,
    TOPOLOGY_SCHEMA_KEY,
    type Agreement,
    type AgreementSection,
    type TopologyMode,
} from "@/lib/core/agreementManifest";

// ── UI → SDK encoder enum normalization ─────────────────────────────────────
//
// The UI accumulated enum values over time that don't match the canonical SDK
// encoder enums (which are the on-chain byte-layout authority). Legacy UI
// values are mapped here so `buildOrderAgreement` emits sections that
// `getSectionDataBytes` can encode without throwing. Unknown values pass
// through verbatim — the encoder throws, which is the correct failure mode.
//
// Known aliases are recorded below; expand as new UI vocabulary lands.

const HANDOFF_MODE_ALIASES: Record<string, string> = {
    "meet-at-door": "face-to-face",
    "meet-at-car": "parking-area",
};

/**
 * Map a canonical fulfilment method to the two v2 fields it expresses:
 * `modality` and (when delivery) `coordination`. The old single-enum
 * fulfilment string collapsed these two dimensions; v2 separates them.
 */
function canonicalFulfilmentToV2(
    method: string,
): { modality: "consume-onsite" | "pickup" | "delivery"; coordination?: "buyer-assigned" | "seller-assigned" | "dutch-auction" } | null {
    switch (method) {
        case "consume-onsite":
            return { modality: "consume-onsite" };
        case "pickup":
            return { modality: "pickup" };
        case "deliver:buyer-assigned":
            return { modality: "delivery", coordination: "buyer-assigned" };
        case "deliver:seller-assigned":
            return { modality: "delivery", coordination: "seller-assigned" };
        case "deliver:dutch-auction":
            return { modality: "delivery", coordination: "dutch-auction" };
        default:
            return null;
    }
}

/**
 * Map a legacy `handoffMode` manifest field to a v2 `handoffPoint` value.
 * `courier-relay` was the old marker for "delivered by courier" — that's
 * now expressed via `modality = delivery`, so we drop it from
 * `handoffPoint` to avoid redundant double-encoding.
 */
function normalizeHandoffPoint(mode: string | undefined): "face-to-face" | "dead-drop" | "parking-area" | "locker" | undefined {
    if (!mode) return undefined;
    const normalized = aliasLookup(HANDOFF_MODE_ALIASES, mode);
    if (normalized === "courier-relay") return undefined;
    const allowed: ReadonlyArray<string> = ["face-to-face", "dead-drop", "parking-area", "locker"];
    if (!allowed.includes(normalized)) return undefined;
    return normalized as "face-to-face" | "dead-drop" | "parking-area" | "locker";
}

/**
 * Reconstruct the legacy `fulfilment.method` shape from a v2 section's
 * `(modality, coordination)` pair, so that `AgreementSummary.fulfilment`
 * stays backward-compatible for callers (ProcessGraphCanvas lens display,
 * etc.) that haven't migrated to the structured form.
 */
function deriveLegacyFulfilment(data: Record<string, unknown>): Record<string, unknown> | undefined {
    const modality = typeof data.modality === "string" ? data.modality : undefined;
    if (!modality) return undefined;
    const coordination = typeof data.coordination === "string" ? data.coordination : undefined;
    if (modality === "delivery" && coordination) {
        return { method: `deliver:${coordination}` };
    }
    if (modality === "consume-onsite") return { method: "consume-onsite" };
    if (modality === "pickup") return { method: "pickup" };
    return undefined;
}

/**
 * Map a legacy UI fulfilmentMethod (+ optional auctionType) to the canonical
 * single-enum fulfilment method. The schema collapsed the prior two-field
 * shape (modality + auction) into one enum that captures both modality and
 * who-organizes-the-fulfiller. Legacy callers (pre-2026-04-26 cleanup) pass
 * `fulfilmentMethod = "deliver"` plus `auctionType = "dutch-auction"`; the
 * combiner translates this to `deliver:dutch-auction`. New callers pass the
 * canonical value directly and it passes through.
 */
/**
 * The five canonical fulfilment-method values, ordered for UI display
 * (least → most coordination overhead). Single canonical enum capturing
 * both modality (consume-onsite / pickup / deliver) AND who-organizes-
 * the-fulfiller (buyer-assigned / seller-assigned / dutch-auction).
 */
export const CANONICAL_FULFILMENT_METHODS_LIST = [
    "consume-onsite",
    "pickup",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
] as const;

export type CanonicalFulfilmentMethod = typeof CANONICAL_FULFILMENT_METHODS_LIST[number];

const CANONICAL_FULFILMENT_METHODS = new Set<string>(CANONICAL_FULFILMENT_METHODS_LIST);

function combineToCanonicalFulfilmentMethod(
    fulfilmentMethod: string | undefined,
    auctionType: string | undefined,
): string | undefined {
    if (!fulfilmentMethod && !auctionType) return undefined;

    // New canonical values pass through unchanged.
    if (fulfilmentMethod && CANONICAL_FULFILMENT_METHODS.has(fulfilmentMethod)) {
        return fulfilmentMethod;
    }

    // Legacy two-field shape: combine modality + auction.
    const isDelivery = fulfilmentMethod === "deliver" || fulfilmentMethod === "delivery";
    if (isDelivery) {
        if (auctionType === "dutch-auction" || auctionType === "dutch") {
            return "deliver:dutch-auction";
        }
        // Default delivery without auction = merchant arranges courier directly.
        return "deliver:seller-assigned";
    }
    if (fulfilmentMethod === "pickup") return "pickup";
    if (fulfilmentMethod === "consume-onsite") return "consume-onsite";

    // Unknown — pass through; encoder will throw downstream.
    return fulfilmentMethod;
}

function aliasLookup(table: Record<string, string>, value: string): string {
    return table[value] ?? value;
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
    fulfilment?: Record<string, unknown>;
    handoff?: Record<string, unknown>;
    ghg?: Record<string, unknown>;
    proximity?: Record<string, unknown>;
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

    const fulfilmentMethod = readManifestExtra(params.manifestFields, ["fulfilmentMethod", "fulfillmentMethod"]);
    const auctionType = readManifestExtra(params.manifestFields, ["auctionType", "auctionMechanism"]);
    const canonicalFulfilmentMethod = combineToCanonicalFulfilmentMethod(fulfilmentMethod, auctionType);
    const handoffMode = readManifestExtra(params.manifestFields, ["handoffMode"]);
    const v2 = canonicalFulfilmentMethod ? canonicalFulfilmentToV2(canonicalFulfilmentMethod) : null;
    if (v2) {
        // Single figaro-fulfilment-v2 section combining modality +
        // coordination (from canonical fulfilment method) and handoffPoint
        // (from legacy handoffMode).
        const handoffPoint = normalizeHandoffPoint(handoffMode);
        const data: Record<string, unknown> = { modality: v2.modality };
        if (v2.coordination) data.coordination = v2.coordination;
        if (handoffPoint) data.handoffPoint = handoffPoint;
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

    const ghgStandard = readManifestExtra(params.manifestFields, ["ghgStandard", "ghgMethodology"]);
    const ghgScope = readManifestExtra(params.manifestFields, ["ghgScope"]);
    if (ghgStandard || ghgScope) {
        const schemaKey = ghgStandard ? (GHG_STANDARD_TO_SCHEMA[ghgStandard] ?? GHG_SCHEMA_KEY) : GHG_SCHEMA_KEY;
        const data: Record<string, unknown> = {};
        if (ghgScope) {
            const parsedScope = Number(ghgScope);
            data.scope = Number.isFinite(parsedScope) ? parsedScope : ghgScope;
        }
        sections.push({
            schema: schemaKey,
            data,
        });
    }

    const proximityBand = readManifestExtra(params.manifestFields, ["proximityBand"]);
    if (proximityBand) {
        sections.push({
            schema: PROXIMITY_POLICY_SCHEMA_KEY,
            data: { band: proximityBand },
        });
    }

    const applicableLaw = readManifestExtra(params.manifestFields, ["applicableLaw"]);
    const forum = readManifestExtra(params.manifestFields, ["forum"]);
    const language = readManifestExtra(params.manifestFields, ["language"]);
    if (applicableLaw) {
        const data: Record<string, unknown> = { applicableLaw };
        if (forum) data.forum = forum;
        if (language) data.language = language;
        sections.push({
            schema: JURISDICTION_SCHEMA_KEY,
            data,
        });
    }

    const documentHash = readManifestExtra(params.manifestFields, ["documentHash"]);
    const documentVersion = readManifestExtra(params.manifestFields, ["documentVersion"]);
    const documentTitle = readManifestExtra(params.manifestFields, ["documentTitle"]);
    if (documentHash && documentVersion && documentTitle) {
        sections.push({
            schema: CONSENT_SCHEMA_KEY,
            data: { documentHash, documentVersion, documentTitle },
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

    const geoSection = getSection(agreement, "figaro-geo-v1");
    const topologySection = getSection(agreement, TOPOLOGY_SCHEMA_KEY);
    const fulfilmentSection = getSection(agreement, FULFILMENT_V2_SCHEMA_KEY);
    const proximitySection = getSection(agreement, PROXIMITY_POLICY_SCHEMA_KEY);
    const jurisdictionSection = getSection(agreement, JURISDICTION_SCHEMA_KEY);
    const consentSection = getSection(agreement, CONSENT_SCHEMA_KEY);
    // GHG disclosure can be under any of 5 sister schemaIds — find whichever is present.
    const ghgSectionEntry = GHG_DISCLOSURE_SCHEMA_KEYS
        .map((key) => ({ key, section: getSection(agreement, key) }))
        .find(({ section }) => section);
    const ghgSection = ghgSectionEntry?.section;
    const ghgStandard = ghgSectionEntry ? GHG_SCHEMA_TO_STANDARD[ghgSectionEntry.key] : undefined;

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
            ? deriveLegacyFulfilment(fulfilmentSection.data)
            : undefined,
        handoff: fulfilmentSection?.data.handoffPoint
            ? { mode: fulfilmentSection.data.handoffPoint }
            : undefined,
        ghg: ghgSection
            ? { ...(ghgStandard ? { standard: ghgStandard } : {}), ...ghgSection.data }
            : undefined,
        proximity: proximitySection?.data,
        jurisdiction: jurisdictionSection?.data,
        consent: consentSection?.data,
    };
}
