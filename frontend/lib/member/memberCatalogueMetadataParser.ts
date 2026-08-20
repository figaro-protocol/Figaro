/**
 * lib/member/memberCatalogueMetadataParser.ts
 *
 * The strict catalogue-document parser is owned by `@figaro-protocol/sdk`
 * (`parseMemberCatalogueDocument`) — the Layer-A validator published
 * across the public seam. This module re-exports it so existing
 * `@/lib/member/...` call sites keep working; add nothing here.
 */

export { parseMemberCatalogueDocument } from "@figaro-protocol/sdk";
