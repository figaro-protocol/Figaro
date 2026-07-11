/**
 * lib/seller/sellerCatalogueMetadataParser.ts
 *
 * The strict catalogue-document parser is owned by `@figaro/sdk`
 * (`parseSellerCatalogueDocument`) — the Layer-A validator published
 * across the public seam. This module re-exports it so existing
 * `@/lib/seller/...` call sites keep working; add nothing here.
 */

export { parseSellerCatalogueDocument } from "@figaro/sdk";
