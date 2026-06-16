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
    CatalogueItemMetadata,
    SellerCatalogueMetadata,
    UnitSystem,
} from "@/lib/seller/sellerCatalogueMetadata";
import {
    asAddress,
    asBoolean,
    asEnum,
    asNumber,
    asOptionalString,
    asRecord,
    asString,
} from "@/lib/shared/parseHelpers";

const ALLOWED_UNIT_SYSTEMS = new Set<UnitSystem>(["metric", "imperial"]);

function parseOptionalNumber(value: unknown, path: string): number | undefined {
    if (value === undefined) return undefined;
    return asNumber(value, path);
}

function parseOptionalUnitSystem(value: unknown, path: string): UnitSystem | undefined {
    if (value === undefined) return undefined;
    return asEnum(value, ALLOWED_UNIT_SYSTEMS, path);
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
        massGrams: parseOptionalNumber(record.massGrams, `${path}.massGrams`),
        volumeMl: parseOptionalNumber(record.volumeMl, `${path}.volumeMl`),
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
