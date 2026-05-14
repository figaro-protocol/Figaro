import type { SellerBrandingMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import type { OperatorAssetReferences } from '@/lib/shared/operatorProfileMetadata';
import {
    asOptionalString,
    asRecord,
    asString,
} from '@/lib/shared/parseHelpers';

export interface RuntimeAssetDocument {
    assetURI: string;
    name?: string;
    branding?: SellerBrandingMetadata;
    assets?: OperatorAssetReferences;
    version: string;
}

export function parseRuntimeAssetDocument(value: unknown, sourceLabel = 'runtime asset document'): RuntimeAssetDocument {
    const record = asRecord(value, sourceLabel);
    const branding = record.branding === undefined ? undefined : asRecord(record.branding, `${sourceLabel}.branding`);
    const assets = record.assets === undefined ? undefined : asRecord(record.assets, `${sourceLabel}.assets`);

    return {
        assetURI: asString(record.assetURI, `${sourceLabel}.assetURI`),
        name: asOptionalString(record.name, `${sourceLabel}.name`),
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
