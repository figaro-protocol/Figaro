/**
 * lib/seller/sellerProfileMetadata.ts
 *
 * The seller PROFILE document shape (types + strict/lenient parsers +
 * the agent-service projection) is owned by `@figaro/sdk` — Layer-A,
 * published across the public seam so an integrator reading
 * `SellerRegistry.metadataURI` learns the shape from the SDK. This module
 * is the frontend's re-export shim; existing `@/lib/seller/...` call sites
 * keep working. Add nothing here — extend the SDK module.
 */

export type {
    SellerProfileMetadata,
    SellerAgentServices,
    SellerAssetReferences,
    CounterpartyBinding,
    AssemblyBindingRecord,
    AgentServiceInfo,
} from "@figaro/sdk";

export {
    parseSellerProfileDocument,
    tryParseSellerProfileDocument,
    projectAgentServices,
} from "@figaro/sdk";
