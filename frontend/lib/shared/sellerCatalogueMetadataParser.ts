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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path} must be an object.`);
    }
    return value as UnknownRecord;
}

function asString(value: unknown, path: string): string {
    if (typeof value !== "string") {
        throw new Error(`${path} must be a string.`);
    }
    return value;
}

function asOptionalString(value: unknown, path: string): string | undefined {
    if (value === undefined) return undefined;
    return asString(value, path);
}

function asBoolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") {
        throw new Error(`${path} must be a boolean.`);
    }
    return value;
}

function asAddress(value: unknown, path: string): `0x${string}` {
    const address = asString(value, path);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`${path} must be a 20-byte hex address.`);
    }
    return address as `0x${string}`;
}

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
