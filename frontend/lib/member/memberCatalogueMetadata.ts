/**
 * lib/member/memberCatalogueMetadata.ts
 *
 * The seller CATALOGUE document shape is owned by `@figaro-protocol/sdk` (Layer-A,
 * published across the public seam so an integrator learns the shape from
 * the SDK, not by disassembling the frontend bundle). This module is the
 * frontend's re-export shim so existing `@/lib/member/...` call sites keep
 * working; add nothing here — extend the SDK module.
 */

export type {
    UnitSystem,
    CatalogueItemMetadata,
    MemberCatalogueMetadata,
} from "@figaro-protocol/sdk";
