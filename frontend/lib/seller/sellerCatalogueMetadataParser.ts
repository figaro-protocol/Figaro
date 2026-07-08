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
    asOptionalNumber,
    asOptionalString,
    asRecord,
    asString,
} from "@/lib/seller/parseHelpers";

const ALLOWED_UNIT_SYSTEMS = new Set<UnitSystem>(["metric", "imperial"]);
const ALLOWED_PRICING_POLICIES = new Set<NonNullable<CatalogueItemMetadata["pricingPolicy"]>>([
    "fixed",
    "rate",
]);

function parseOptionalPricingPolicy(
    value: unknown,
    path: string,
): CatalogueItemMetadata["pricingPolicy"] {
    if (value === undefined) return undefined;
    return asEnum(value, ALLOWED_PRICING_POLICIES, path);
}


function parseOptionalUnitSystem(value: unknown, path: string): UnitSystem | undefined {
    if (value === undefined) return undefined;
    return asEnum(value, ALLOWED_UNIT_SYSTEMS, path);
}


function parseItem(value: unknown, path: string): CatalogueItemMetadata {
    const record = asRecord(value, path);
    return {
        id: asString(record.id, `${path}.id`),
        name: asString(record.name, `${path}.name`),
        description: asOptionalString(record.description, `${path}.description`),
        price: asString(record.price, `${path}.price`),
        category: asOptionalString(record.category, `${path}.category`),
        image: asOptionalString(record.image, `${path}.image`),
        available: asBoolean(record.available, `${path}.available`),
        massGrams: asOptionalNumber(record.massGrams, `${path}.massGrams`),
        volumeMl: asOptionalNumber(record.volumeMl, `${path}.volumeMl`),
        lengthMm: asOptionalNumber(record.lengthMm, `${path}.lengthMm`),
        widthMm: asOptionalNumber(record.widthMm, `${path}.widthMm`),
        heightMm: asOptionalNumber(record.heightMm, `${path}.heightMm`),
        pricingPolicy: parseOptionalPricingPolicy(record.pricingPolicy, `${path}.pricingPolicy`),
        rateUnit: asOptionalString(record.rateUnit, `${path}.rateUnit`),
        rateQuantitySource: asOptionalString(record.rateQuantitySource, `${path}.rateQuantitySource`),
        clauseValues: parseClauseValues(record.clauseValues, `${path}.clauseValues`),
    };
}

/**
 * Parse the catalogue-sourced clause-value map — a `Record<clauseId, Record<field, unknown>>`.
 * Structural only: the outer shape is a record of records; the inner field
 * values are validated against each clause's registered spec (Layer A) at
 * authoring / read time, not here (this parser has no spec cache). Field
 * values pass through as `unknown`.
 */
function parseClauseValues(
    value: unknown,
    path: string,
): CatalogueItemMetadata["clauseValues"] {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    const out: Record<string, Record<string, unknown>> = {};
    for (const [clauseId, data] of Object.entries(record)) {
        out[clauseId] = asRecord(data, `${path}.${clauseId}`);
    }
    return out;
}

function parseItems(value: unknown, path: string): CatalogueItemMetadata[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => parseItem(entry, `${path}[${index}]`));
}

export function parseSellerCatalogueDocument(value: unknown, sourceLabel = "seller catalogue metadata"): SellerCatalogueMetadata {
    const record = asRecord(value, sourceLabel);

    return {
        subjectAddress: asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        items: parseItems(record.items, `${sourceLabel}.items`),
        version: asString(record.version, `${sourceLabel}.version`),
        unitSystem: parseOptionalUnitSystem(record.unitSystem, `${sourceLabel}.unitSystem`),
    };
}
