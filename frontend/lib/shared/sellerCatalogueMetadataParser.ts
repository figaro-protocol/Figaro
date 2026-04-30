import { SellerCatalogueMetadata, SellerHours, CatalogueItemMetadata, ServiceAreaMetadata } from "@/lib/shared/sellerCatalogueMetadata";

type UnknownRecord = Record<string, unknown>;

const FULFILLMENT_MODES = new Set<
    | "consume-onsite"
    | "pickup"
    | "delivery"
    | "deliver:buyer-assigned"
    | "deliver:seller-assigned"
    | "deliver:dutch-auction"
>([
    "consume-onsite",
    "pickup",
    "delivery",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
]);
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

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
    if (value === undefined) {
        return undefined;
    }

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

function asEnum<T extends string>(value: unknown, allowed: Set<T>, path: string): T {
    const stringValue = asString(value, path);
    if (!allowed.has(stringValue as T)) {
        throw new Error(`${path} must be one of: ${[...allowed].join(", ")}.`);
    }
    return stringValue as T;
}

function parseServiceArea(value: unknown, path: string): ServiceAreaMetadata {
    const record = asRecord(value, path);
    return {
        geohashPrefix: asString(record.geohashPrefix, `${path}.geohashPrefix`),
        label: asOptionalString(record.label, `${path}.label`),
    };
}

function parseServiceAreas(value: unknown, path: string): ServiceAreaMetadata[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => parseServiceArea(entry, `${path}[${index}]`));
}

function parseMenuItem(value: unknown, path: string): CatalogueItemMetadata {
    const record = asRecord(value, path);
    return {
        id: asString(record.id, `${path}.id`),
        name: asString(record.name, `${path}.name`),
        description: asOptionalString(record.description, `${path}.description`),
        price: asString(record.price, `${path}.price`),
        currencySymbol: asOptionalString(record.currencySymbol, `${path}.currencySymbol`),
        category: asString(record.category, `${path}.category`),
        image: asOptionalString(record.image, `${path}.image`),
        available: asBoolean(record.available, `${path}.available`),
    };
}

function parseMenu(value: unknown, path: string): CatalogueItemMetadata[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => parseMenuItem(entry, `${path}[${index}]`));
}

function parseHours(value: unknown, path: string): SellerHours | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    const hours: SellerHours = {
        timezone: asString(record.timezone, `${path}.timezone`),
        windows: {},
    };

    const rawWindows = asRecord(record.windows, `${path}.windows`);
    for (const day of WEEKDAYS) {
        const dayValue = rawWindows[day];
        if (dayValue === undefined) continue;
        if (!Array.isArray(dayValue)) {
            throw new Error(`${path}.windows.${day} must be an array.`);
        }
        hours.windows[day] = dayValue.map((entry, index) => {
            const windowRecord = asRecord(entry, `${path}.windows.${day}[${index}]`);
            return {
                open: asString(windowRecord.open, `${path}.windows.${day}[${index}].open`),
                close: asString(windowRecord.close, `${path}.windows.${day}[${index}].close`),
            };
        });
    }

    return hours;
}

export function parseSellerCatalogueDocument(value: unknown, sourceLabel = "seller catalogue metadata"): SellerCatalogueMetadata {
    const record = asRecord(value, sourceLabel);

    const fulfillmentModesRaw = record.fulfillmentModes;
    if (!Array.isArray(fulfillmentModesRaw)) {
        throw new Error(`${sourceLabel}.fulfillmentModes must be an array.`);
    }

    const location = asRecord(record.location, `${sourceLabel}.location`);
    const branding = record.branding === undefined ? undefined : asRecord(record.branding, `${sourceLabel}.branding`);
    const assets = record.assets === undefined ? undefined : asRecord(record.assets, `${sourceLabel}.assets`);

    return {
        subjectAddress: asAddress(record.subjectAddress, `${sourceLabel}.subjectAddress`),
        archetypeId: asEnum(
            record.archetypeId,
            new Set([
                "merchant-one-hop-delivery",
                "bonded-procurement-supplier",
                "disclosure-review-operator",
                "equipment-rental-operator",
                "freelance-operator",
            ]),
            `${sourceLabel}.archetypeId`,
        ),
        merchantId: asString(record.merchantId, `${sourceLabel}.merchantId`),
        slug: asString(record.slug, `${sourceLabel}.slug`),
        name: asString(record.name, `${sourceLabel}.name`),
        description: asOptionalString(record.description, `${sourceLabel}.description`),
        cuisine: asOptionalString(record.cuisine, `${sourceLabel}.cuisine`),
        fulfillmentModes: fulfillmentModesRaw.map((entry, index) => asEnum(entry, FULFILLMENT_MODES, `${sourceLabel}.fulfillmentModes[${index}]`)),
        location: {
            geohash: asString(location.geohash, `${sourceLabel}.location.geohash`),
            addressText: asOptionalString(location.addressText, `${sourceLabel}.location.addressText`),
        },
        serviceAreas: parseServiceAreas(record.serviceAreas, `${sourceLabel}.serviceAreas`),
        minimumOrder: asOptionalString(record.minimumOrder, `${sourceLabel}.minimumOrder`),
        estimatedFulfillment: asOptionalString(record.estimatedFulfillment, `${sourceLabel}.estimatedFulfillment`),
        hours: parseHours(record.hours, `${sourceLabel}.hours`),
        menu: parseMenu(record.menu, `${sourceLabel}.menu`),
        branding: branding ? {
            displayName: asOptionalString(branding.displayName, `${sourceLabel}.branding.displayName`),
            logoURI: asOptionalString(branding.logoURI, `${sourceLabel}.branding.logoURI`),
            heroImageURI: asOptionalString(branding.heroImageURI, `${sourceLabel}.branding.heroImageURI`),
            accentColor: asOptionalString(branding.accentColor, `${sourceLabel}.branding.accentColor`),
            themeClass: asOptionalString(branding.themeClass, `${sourceLabel}.branding.themeClass`),
        } : undefined,
        assets: assets ? {
            cssURI: asOptionalString(assets.cssURI, `${sourceLabel}.assets.cssURI`),
            imageBaseURI: asOptionalString(assets.imageBaseURI, `${sourceLabel}.assets.imageBaseURI`),
        } : undefined,
        version: asString(record.version, `${sourceLabel}.version`),
    };
}