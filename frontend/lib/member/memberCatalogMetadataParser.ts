/**
 * lib/member/memberCatalogMetadataParser.ts
 *
 * The strict catalog-document parser is owned by `@figaro-protocol/sdk`
 * (`parseMemberCatalogDocument`) — the off-chain validator published
 * across the public seam. This module re-exports it so existing
 * `@/lib/member/...` call sites keep working; add nothing here.
 */

export { parseMemberCatalogDocument } from "@figaro-protocol/sdk";
