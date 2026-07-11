/**
 * lib/seller/sellerCatalogueMetadata.ts
 *
 * The seller CATALOGUE document shape is owned by `@figaro/sdk` (Layer-A,
 * published across the public seam so an integrator learns the shape from
 * the SDK, not by disassembling the frontend bundle). This module is the
 * frontend's re-export shim so existing `@/lib/seller/...` call sites keep
 * working; add nothing here — extend the SDK module.
 */

export type {
    UnitSystem,
    CatalogueItemMetadata,
    SellerCatalogueMetadata,
} from "@figaro/sdk";
