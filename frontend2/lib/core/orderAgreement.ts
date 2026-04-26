import type { ManifestFields } from "@/lib/core/encoding";
import {
    type AgreementLineItem,
    buildAgreement,
    buildCommerceSection,
    buildTopologySection,
    FULFILMENT_SCHEMA_KEY,
    GHG_SCHEMA_KEY,
    GHG_DISCLOSURE_SCHEMA_KEYS,
    HANDOFF_SCHEMA_KEY,
    JURISDICTION_SCHEMA_KEY,
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
 * Map a legacy UI fulfilmentMethod (+ optional auctionType) to the canonical
 * single-enum fulfilment method. The schema collapsed the prior two-field
 * shape (modality + auction) into one enum that captures both modality and
 * who-organizes-the-fulfiller. Legacy callers (pre-2026-04-26 cleanup) pass
 * `fulfilmentMethod = "deliver"` plus `auctionType = "dutch-auction"`; the
 * combiner translates this to `deliver:dutch-auction`. New callers pass the
 * canonical value directly and it passes through.
 */
const CANONICAL_FULFILMENT_METHODS = new Set([
    "consume-onsite",
    "pickup",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
]);

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

/**
 * Map a UI standard string to its corresponding GHG sister schemaId. Each
 * accounting standard is now its own schema; the standard identity lives in
 * the schemaId, not in a content field. Unknown values fall through to the
 * default GHG_SCHEMA_KEY.
 */
const GHG_STANDARD_TO_SCHEMA: Record<string, typeof GHG_DISCLOSURE_SCHEMA_KEYS[number]> = {
    "iso-14064-1": "figaro-ghg-iso-14064-v1",
    "iso-14064-2": "figaro-ghg-iso-14064-v1",
    "iso-14064-3": "figaro-ghg-iso-14064-v1",
    "ISO-14064": "figaro-ghg-iso-14064-v1",
    "ghg-protocol-corporate": "figaro-ghg-protocol-v1",
    "ghg-protocol-scope3": "figaro-ghg-protocol-v1",
    "GHG-Protocol": "figaro-ghg-protocol-v1",
    "pas-2050": "figaro-ghg-pas-2050-v1",
    "PAS-2050": "figaro-ghg-pas-2050-v1",
    "en-16258": "figaro-ghg-en-16258-v1",
    "EN-16258": "figaro-ghg-en-16258-v1",
    "custom": "figaro-ghg-custom-v1",
    "Custom": "figaro-ghg-custom-v1",
};

/** Reverse lookup: schemaId → human-readable standard label (for summaries). */
const GHG_SCHEMA_TO_STANDARD: Record<string, string> = {
    "figaro-ghg-protocol-v1": "GHG-Protocol",
    "figaro-ghg-iso-14064-v1": "ISO-14064",
    "figaro-ghg-pas-2050-v1": "PAS-2050",
    "figaro-ghg-en-16258-v1": "EN-16258",
    "figaro-ghg-custom-v1": "Custom",
};

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
    if (canonicalFulfilmentMethod) {
        sections.push({
            schema: FULFILMENT_SCHEMA_KEY,
            data: { method: canonicalFulfilmentMethod },
        });
    }

    const handoffMode = readManifestExtra(params.manifestFields, ["handoffMode"]);
    if (handoffMode) {
        sections.push({
            schema: HANDOFF_SCHEMA_KEY,
            data: { mode: aliasLookup(HANDOFF_MODE_ALIASES, handoffMode) },
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
    const fulfilmentSection = getSection(agreement, FULFILMENT_SCHEMA_KEY);
    const handoffSection = getSection(agreement, HANDOFF_SCHEMA_KEY);
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
        fulfilment: fulfilmentSection?.data,
        handoff: handoffSection?.data,
        ghg: ghgSection
            ? { ...(ghgStandard ? { standard: ghgStandard } : {}), ...ghgSection.data }
            : undefined,
    };
}
