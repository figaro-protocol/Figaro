import type { ManifestFields } from "@/lib/core/encoding";
import {
    type AgreementLineItem,
    buildAgreement,
    buildCommerceSection,
    buildTopologySection,
    FULFILMENT_SCHEMA_KEY,
    GHG_SCHEMA_KEY,
    HANDOFF_SCHEMA_KEY,
    getSection,
    manifestFieldsToGeoSection,
    TOPOLOGY_SCHEMA_KEY,
    type Agreement,
    type AgreementSection,
    type TopologyMode,
} from "@/lib/core/agreementManifest";

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
    if (fulfilmentMethod || auctionType) {
        const data: Record<string, unknown> = {};
        if (fulfilmentMethod) data.method = fulfilmentMethod;
        if (auctionType) data.auction = auctionType;
        sections.push({
            schema: FULFILMENT_SCHEMA_KEY,
            data,
        });
    }

    const handoffMode = readManifestExtra(params.manifestFields, ["handoffMode"]);
    if (handoffMode) {
        sections.push({
            schema: HANDOFF_SCHEMA_KEY,
            data: { mode: handoffMode },
        });
    }

    const ghgStandard = readManifestExtra(params.manifestFields, ["ghgStandard", "ghgMethodology"]);
    const ghgScope = readManifestExtra(params.manifestFields, ["ghgScope"]);
    if (ghgStandard || ghgScope) {
        const data: Record<string, unknown> = {};
        if (ghgStandard) data.standard = ghgStandard;
        if (ghgScope) {
            const parsedScope = Number(ghgScope);
            data.scope = Number.isFinite(parsedScope) ? parsedScope : ghgScope;
        }
        sections.push({
            schema: GHG_SCHEMA_KEY,
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
    const ghgSection = getSection(agreement, GHG_SCHEMA_KEY);

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
        ghg: ghgSection?.data,
    };
}
