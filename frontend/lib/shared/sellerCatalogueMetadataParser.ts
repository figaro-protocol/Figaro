/**
 * lib/shared/sellerCatalogueMetadataParser.ts
 *
 * Strict parser for the catalogue document. The catalogue carries only
 * the volatile sales-context payload (items + version + subjectAddress);
 * identity, branding, location, accepted tokens, agent endpoints, and
 * assembly bindings live on the operator profile (see
 * `operatorProfileMetadata.ts`).
 */

import {
    CatalogueItemMetadata,
    SellerCatalogueMetadata,
} from "@/lib/shared/sellerCatalogueMetadata";
import {
    asAddress,
    asBoolean,
    asOptionalString,
    asRecord,
    asString,
} from "@/lib/shared/parseHelpers";

function parseSchemaAttestations(value: unknown, path: string): Record<string, Record<string, unknown>> | undefined {
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
        schemaAttestations: parseSchemaAttestations(record.schemaAttestations, `${path}.schemaAttestations`),
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
    };
}
