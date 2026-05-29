/**
 * lib/shared/sellerCatalogueMetadataParser.ts
 *
 * Strict parser for the catalogue document. The catalogue carries only
 * the volatile sales-context payload (items + version + subjectAddress);
 * identity, branding, location, accepted tokens, agent endpoints, and
 * assembly bindings live on the seller profile (see
 * `sellerProfileMetadata.ts`).
 */

import {
    CatalogueClassOfService,
    CatalogueItemMetadata,
    CataloguePricingPolicy,
    NegotiatedPriceEntry,
    SellerCatalogueMetadata,
    UnitSystem,
} from "@/lib/shared/sellerCatalogueMetadata";
import {
    asAddress,
    asBoolean,
    asEnum,
    asNumber,
    asOptionalString,
    asRecord,
    asString,
} from "@/lib/shared/parseHelpers";

const ALLOWED_CLASS_OF_SERVICE = new Set<CatalogueClassOfService>([
    "standard",
    "express",
    "fragile",
    "cold-chain",
]);
const ALLOWED_UNIT_SYSTEMS = new Set<UnitSystem>(["metric", "imperial"]);

function parseOptionalNumber(value: unknown, path: string): number | undefined {
    if (value === undefined) return undefined;
    return asNumber(value, path);
}

function parseOptionalClassOfService(
    value: unknown,
    path: string,
): CatalogueClassOfService | undefined {
    if (value === undefined) return undefined;
    return asEnum(value, ALLOWED_CLASS_OF_SERVICE, path);
}

function parseOptionalUnitSystem(value: unknown, path: string): UnitSystem | undefined {
    if (value === undefined) return undefined;
    return asEnum(value, ALLOWED_UNIT_SYSTEMS, path);
}

function parseClauseAttestations(value: unknown, path: string): Record<string, Record<string, unknown>> | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, raw] of Object.entries(record)) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error(`${path}.${key} must be an object.`);
        }
        out[key] = raw as Record<string, unknown>;
    }
    return out;
}

const ALLOWED_PRICING_POLICY = new Set<CataloguePricingPolicy>([
    "fixed",
    "buyer-set",
    "dutch-auction",
]);

function parseOptionalPricingPolicy(
    value: unknown,
    path: string,
): CataloguePricingPolicy | undefined {
    if (value === undefined) return undefined;
    return asEnum(value, ALLOWED_PRICING_POLICY, path);
}

function parseOptionalNegotiatedPrices(
    value: unknown,
    path: string,
): NegotiatedPriceEntry[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
    return value.map((entry, index) => {
        const rec = asRecord(entry, `${path}[${index}]`);
        return {
            counterparty: asAddress(rec.counterparty, `${path}[${index}].counterparty`),
            price: asString(rec.price, `${path}[${index}].price`),
        };
    });
}

function parseMenuItem(value: unknown, path: string): CatalogueItemMetadata {
    const record = asRecord(value, path);
    return {
        id: asString(record.id, `${path}.id`),
        name: asString(record.name, `${path}.name`),
        description: asOptionalString(record.description, `${path}.description`),
        price: asString(record.price, `${path}.price`),
        category: asString(record.category, `${path}.category`),
        image: asOptionalString(record.image, `${path}.image`),
        available: asBoolean(record.available, `${path}.available`),
        assemblySlug: asOptionalString(record.assemblySlug, `${path}.assemblySlug`),
        massGrams: parseOptionalNumber(record.massGrams, `${path}.massGrams`),
        volumeMl: parseOptionalNumber(record.volumeMl, `${path}.volumeMl`),
        classOfService: parseOptionalClassOfService(record.classOfService, `${path}.classOfService`),
        pricingPolicy: parseOptionalPricingPolicy(record.pricingPolicy, `${path}.pricingPolicy`),
        negotiatedPrices: parseOptionalNegotiatedPrices(record.negotiatedPrices, `${path}.negotiatedPrices`),
        clauseAttestations: parseClauseAttestations(record.clauseAttestations, `${path}.clauseAttestations`),
    };
}

function parseMenu(value: unknown, path: string): CatalogueItemMetadata[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => parseMenuItem(entry, `${path}[${index}]`));
}

export function parseSellerCatalogueDocument(value: unknown, sourceLabel = "seller catalogue metadata"): SellerCatalogueMetadata {
    const record = asRecord(value, sourceLabel);

    return {
        subjectAddress: asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        menu: parseMenu(record.menu, `${sourceLabel}.menu`),
        version: asString(record.version, `${sourceLabel}.version`),
        unitSystem: parseOptionalUnitSystem(record.unitSystem, `${sourceLabel}.unitSystem`),
    };
}
