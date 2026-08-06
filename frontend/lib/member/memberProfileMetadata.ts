/**
 * lib/seller/memberProfileMetadata.ts
 *
 * The member PROFILE document shape (types + strict/lenient parsers +
 * the agent-service projection) is owned by `@figaro/sdk` — Layer-A,
 * published across the public seam so an integrator reading
 * `MembersRegistry.metadataURI` learns the shape from the SDK. This module
 * is the frontend's re-export shim; existing `@/lib/seller/...` call sites
 * keep working. Add nothing here — extend the SDK module.
 */

export type {
    MemberProfileMetadata,
    MemberAgentServices,
    MemberAssetReferences,
    CounterpartyBinding,
    AssemblyBindingRecord,
    BuyerAssemblySubscription,
    DisclosurePolicyEntry,
    AgentServiceInfo,
} from "@figaro/sdk";

export {
    parseMemberProfileDocument,
    tryParseMemberProfileDocument,
    projectAgentServices,
} from "@figaro/sdk";
